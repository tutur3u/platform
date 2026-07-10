-- Cloudflare-native mail foundation. This migration is additive and preserves
-- the existing SES path while making domain/provider/storage selection explicit.

create table private.mail_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  status text not null default 'pending'
    check (status in ('pending', 'verifying', 'active', 'disabled', 'quarantined')),
  inbound_provider text not null default 'ses'
    check (inbound_provider in ('cloudflare', 'ses')),
  outbound_provider text not null default 'ses'
    check (outbound_provider in ('cloudflare', 'ses')),
  cloudflare_account_id text,
  cloudflare_zone_id text,
  cloudflare_routing_rule_id text,
  verification_state jsonb not null default '{}'::jsonb,
  operational_metadata jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mail_domains_normalized_domain
    check (
      domain = lower(domain)
      and domain !~ '[.@]$'
      and domain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    )
);

create unique index mail_domains_domain_key
  on private.mail_domains (domain);

create index mail_domains_provider_status_idx
  on private.mail_domains (status, inbound_provider, outbound_provider);

create trigger set_mail_domains_updated_at
  before update on private.mail_domains
  for each row execute function private.set_mail_updated_at();

insert into private.mail_domains (
  domain,
  status,
  inbound_provider,
  outbound_provider,
  verification_state,
  operational_metadata,
  verified_at
)
values (
  'tuturuuu.com',
  'active',
  'ses',
  'ses',
  '{"backfilled": true}'::jsonb,
  '{"source": "agentic_mail_foundation"}'::jsonb,
  now()
)
on conflict (domain) do nothing;

alter table private.mail_mailboxes
  add column domain_id uuid references private.mail_domains(id) on delete restrict,
  add column sender_name text not null default '',
  add column signature_html text,
  add column signature_text text,
  add column ai_instructions text not null default '',
  add column auto_draft_enabled boolean not null default false,
  add column auto_draft_policy jsonb not null default '{}'::jsonb,
  add column outbound_provider_override text
    check (outbound_provider_override in ('cloudflare', 'ses'));

update private.mail_mailboxes
set domain_id = (
  select id from private.mail_domains where domain = 'tuturuuu.com'
)
where domain_id is null;

alter table private.mail_mailboxes
  alter column domain_id set not null,
  drop constraint mail_mailboxes_exact_tuturuuu_address,
  add constraint mail_mailboxes_normalized_address
    check (
      address = lower(address)
      and address ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    );

create index mail_mailboxes_domain_status_idx
  on private.mail_mailboxes (domain_id, status);

create or replace function private.enforce_mailbox_domain()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked_domain text;
begin
  select domain into linked_domain
  from private.mail_domains
  where id = new.domain_id;

  if linked_domain is null then
    raise exception 'mailbox domain does not exist';
  end if;

  if split_part(new.address, '@', 2) <> linked_domain then
    raise exception 'mailbox address must match its linked domain';
  end if;

  return new;
end;
$$;

create trigger enforce_mailbox_domain
  before insert or update of address, domain_id on private.mail_mailboxes
  for each row execute function private.enforce_mailbox_domain();

-- Normalized subjects remain a fallback search hint only. Message-ID,
-- In-Reply-To, and References are resolved by the ingestion layer.
drop index if exists private.mail_threads_mailbox_normalized_subject_key;

create index mail_threads_mailbox_normalized_subject_idx
  on private.mail_threads (mailbox_id, normalized_subject);

create unique index mail_messages_mailbox_provider_delivery_key
  on private.mail_messages (mailbox_id, provider, provider_message_id)
  where provider_message_id is not null;

create unique index mail_messages_mailbox_internet_message_id_key
  on private.mail_messages (mailbox_id, internet_message_id)
  where internet_message_id is not null;

create index mail_messages_mailbox_in_reply_to_idx
  on private.mail_messages (mailbox_id, in_reply_to)
  where in_reply_to is not null;

create index mail_messages_references_headers_idx
  on private.mail_messages using gin (references_headers);

alter table private.mail_messages
  add column search_document tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(subject, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(from_address, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(from_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(body_text, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(snippet, '')), 'D')
  ) stored;

create index mail_messages_search_document_idx
  on private.mail_messages using gin (search_document);

create index mail_messages_mailbox_received_at_idx
  on private.mail_messages (mailbox_id, received_at desc nulls last);

create index mail_messages_mailbox_sent_at_idx
  on private.mail_messages (mailbox_id, sent_at desc nulls last);

create index mail_messages_mailbox_has_attachments_idx
  on private.mail_messages (mailbox_id, has_attachments)
  where has_attachments;

create table private.mail_stored_objects (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid references private.mail_mailboxes(id) on delete cascade,
  message_id uuid references private.mail_messages(id) on delete cascade,
  provider text not null check (provider in ('r2', 's3')),
  object_kind text not null check (object_kind in ('raw_mime', 'body', 'attachment')),
  bucket_name text not null,
  object_key text not null,
  content_type text not null default 'application/octet-stream',
  content_disposition text,
  content_id text,
  filename text,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (provider, bucket_name, object_key)
);

create index mail_stored_objects_message_kind_idx
  on private.mail_stored_objects (message_id, object_kind)
  where deleted_at is null;

alter table private.mail_raw_messages
  add column stored_object_id uuid references private.mail_stored_objects(id) on delete set null;

alter table private.mail_inbound_jobs
  add column stored_object_id uuid references private.mail_stored_objects(id) on delete set null;

alter table private.mail_attachments
  add column stored_object_id uuid references private.mail_stored_objects(id) on delete set null;

create table private.mail_folders (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references private.mail_mailboxes(id) on delete cascade,
  name text not null,
  slug text not null,
  kind text not null default 'custom' check (kind in ('system', 'custom')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mailbox_id, slug)
);

create trigger set_mail_folders_updated_at
  before update on private.mail_folders
  for each row execute function private.set_mail_updated_at();

create table private.mail_message_folders (
  message_id uuid not null references private.mail_messages(id) on delete cascade,
  folder_id uuid not null references private.mail_folders(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, folder_id)
);

create index mail_message_folders_folder_id_idx
  on private.mail_message_folders (folder_id);

create table private.mail_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references private.mail_mailboxes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null default '',
  memory_container_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index mail_ai_conversations_mailbox_user_idx
  on private.mail_ai_conversations (mailbox_id, user_id, updated_at desc);

create trigger set_mail_ai_conversations_updated_at
  before update on private.mail_ai_conversations
  for each row execute function private.set_mail_updated_at();

create table private.mail_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references private.mail_ai_conversations(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content jsonb not null default '[]'::jsonb,
  model_id text,
  created_at timestamptz not null default now()
);

create index mail_ai_messages_conversation_created_idx
  on private.mail_ai_messages (conversation_id, created_at);

create table private.mail_ai_tool_executions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references private.mail_ai_conversations(id) on delete cascade,
  mailbox_id uuid not null references private.mail_mailboxes(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  tool_name text not null,
  requested_scope text not null check (requested_scope in ('read', 'organize', 'draft')),
  arguments jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  status text not null check (status in ('started', 'succeeded', 'denied', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index mail_ai_tool_executions_mailbox_created_idx
  on private.mail_ai_tool_executions (mailbox_id, created_at desc);

create table private.mail_auto_draft_jobs (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references private.mail_mailboxes(id) on delete cascade,
  message_id uuid not null references private.mail_messages(id) on delete cascade,
  draft_message_id uuid references private.mail_messages(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'drafted', 'skipped', 'failed')),
  injection_risk text check (injection_risk in ('none', 'suspicious', 'blocked')),
  skip_reason text,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (mailbox_id, message_id)
);

create index mail_auto_draft_jobs_status_created_idx
  on private.mail_auto_draft_jobs (status, created_at);

create trigger set_mail_auto_draft_jobs_updated_at
  before update on private.mail_auto_draft_jobs
  for each row execute function private.set_mail_updated_at();

create table private.mail_mcp_credentials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_prefix text not null,
  token_hash text not null,
  scopes text[] not null,
  created_by uuid not null references public.users(id) on delete cascade,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mail_mcp_credentials_scopes_nonempty
    check (cardinality(scopes) > 0),
  constraint mail_mcp_credentials_scopes_allowed
    check (scopes <@ array['read', 'organize', 'draft']::text[])
);

create unique index mail_mcp_credentials_token_hash_key
  on private.mail_mcp_credentials (token_hash);

create index mail_mcp_credentials_active_prefix_idx
  on private.mail_mcp_credentials (token_prefix)
  where revoked_at is null;

create table private.mail_mcp_credential_mailboxes (
  credential_id uuid not null references private.mail_mcp_credentials(id) on delete cascade,
  mailbox_id uuid not null references private.mail_mailboxes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (credential_id, mailbox_id)
);

alter table private.mail_domains enable row level security;
alter table private.mail_stored_objects enable row level security;
alter table private.mail_folders enable row level security;
alter table private.mail_message_folders enable row level security;
alter table private.mail_ai_conversations enable row level security;
alter table private.mail_ai_messages enable row level security;
alter table private.mail_ai_tool_executions enable row level security;
alter table private.mail_auto_draft_jobs enable row level security;
alter table private.mail_mcp_credentials enable row level security;
alter table private.mail_mcp_credential_mailboxes enable row level security;

revoke all on table
  private.mail_domains,
  private.mail_stored_objects,
  private.mail_folders,
  private.mail_message_folders,
  private.mail_ai_conversations,
  private.mail_ai_messages,
  private.mail_ai_tool_executions,
  private.mail_auto_draft_jobs,
  private.mail_mcp_credentials,
  private.mail_mcp_credential_mailboxes
from anon, authenticated;

grant select, insert, update, delete on table
  private.mail_domains,
  private.mail_stored_objects,
  private.mail_folders,
  private.mail_message_folders,
  private.mail_ai_conversations,
  private.mail_ai_messages,
  private.mail_ai_tool_executions,
  private.mail_auto_draft_jobs,
  private.mail_mcp_credentials,
  private.mail_mcp_credential_mailboxes
to service_role;

comment on table private.mail_domains is
  'Platform-managed mail domains with permanent per-domain inbound and outbound provider selection.';
comment on table private.mail_stored_objects is
  'Private metadata for raw MIME, bodies, and attachment bytes stored in R2 or legacy S3.';
comment on table private.mail_mcp_credentials is
  'Hashed, revocable MCP credentials. Plaintext credentials are never persisted.';
