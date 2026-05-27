create schema if not exists private;

grant usage on schema private to service_role;

create or replace function private.set_mail_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table private.mail_mailboxes (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  type text not null default 'personal'
    check (type in ('personal', 'shared')),
  status text not null default 'active'
    check (status in ('active', 'disabled', 'quarantined', 'archived')),
  display_name text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint mail_mailboxes_exact_tuturuuu_address
    check (address = lower(address) and address ~ '^[a-z0-9._%+-]+@tuturuuu\.com$')
);

create unique index mail_mailboxes_address_key
  on private.mail_mailboxes (lower(address));

create index mail_mailboxes_status_idx
  on private.mail_mailboxes (status);

create trigger set_mail_mailboxes_updated_at
  before update on private.mail_mailboxes
  for each row
  execute function private.set_mail_updated_at();

create table private.mail_mailbox_members (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references private.mail_mailboxes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('owner', 'admin', 'sender', 'viewer')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mailbox_id, user_id)
);

create index mail_mailbox_members_user_id_idx
  on private.mail_mailbox_members (user_id);

create trigger set_mail_mailbox_members_updated_at
  before update on private.mail_mailbox_members
  for each row
  execute function private.set_mail_updated_at();

create table private.mail_raw_messages (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'ses',
  provider_message_id text not null,
  s3_bucket text,
  s3_key text,
  sha256 text,
  size_bytes bigint,
  spam_verdict text,
  virus_verdict text,
  spf_verdict text,
  dkim_verdict text,
  dmarc_verdict text,
  raw_headers jsonb not null default '{}'::jsonb,
  provider_payload jsonb not null default '{}'::jsonb,
  status text not null default 'imported'
    check (status in ('imported', 'quarantined', 'failed')),
  created_at timestamptz not null default now(),
  unique (provider, provider_message_id)
);

create unique index mail_raw_messages_s3_object_key
  on private.mail_raw_messages (s3_bucket, s3_key)
  where s3_bucket is not null and s3_key is not null;

create table private.mail_threads (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references private.mail_mailboxes(id) on delete cascade,
  subject text not null default '',
  normalized_subject text not null default '',
  last_message_at timestamptz,
  message_count integer not null default 0 check (message_count >= 0),
  unread_count integer not null default 0 check (unread_count >= 0),
  status text not null default 'active'
    check (status in ('active', 'archived', 'trash', 'spam')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mail_threads_mailbox_last_message_idx
  on private.mail_threads (mailbox_id, last_message_at desc nulls last);

create unique index mail_threads_mailbox_normalized_subject_key
  on private.mail_threads (mailbox_id, normalized_subject);

create trigger set_mail_threads_updated_at
  before update on private.mail_threads
  for each row
  execute function private.set_mail_updated_at();

create table private.mail_messages (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references private.mail_mailboxes(id) on delete cascade,
  thread_id uuid references private.mail_threads(id) on delete set null,
  raw_message_id uuid references private.mail_raw_messages(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  provider text not null default 'ses',
  provider_message_id text,
  internet_message_id text,
  in_reply_to text,
  references_headers text[] not null default '{}'::text[],
  from_address text not null,
  from_name text,
  subject text not null default '',
  snippet text,
  body_text text,
  body_html text,
  sanitized_html text,
  sent_at timestamptz,
  received_at timestamptz,
  status text not null default 'received'
    check (status in ('received', 'draft', 'queued', 'sending', 'sent', 'failed', 'quarantined')),
  size_bytes bigint,
  has_attachments boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mail_messages_from_has_at
    check (position('@' in from_address) > 1)
);

create index mail_messages_mailbox_status_created_idx
  on private.mail_messages (mailbox_id, status, created_at desc);

create index mail_messages_thread_created_idx
  on private.mail_messages (thread_id, created_at);

create index mail_messages_internet_message_id_idx
  on private.mail_messages (internet_message_id);

create trigger set_mail_messages_updated_at
  before update on private.mail_messages
  for each row
  execute function private.set_mail_updated_at();

create table private.mail_recipients (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references private.mail_messages(id) on delete cascade,
  kind text not null check (kind in ('from', 'to', 'cc', 'bcc', 'reply_to')),
  address text not null,
  display_name text,
  created_at timestamptz not null default now(),
  constraint mail_recipients_address_has_at
    check (position('@' in address) > 1)
);

create index mail_recipients_message_kind_idx
  on private.mail_recipients (message_id, kind);

create index mail_recipients_address_idx
  on private.mail_recipients (lower(address));

create table private.mail_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references private.mail_messages(id) on delete cascade,
  raw_message_id uuid references private.mail_raw_messages(id) on delete set null,
  filename text not null,
  content_type text not null default 'application/octet-stream',
  content_id text,
  disposition text not null default 'attachment'
    check (disposition in ('attachment', 'inline')),
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  storage_bucket text,
  storage_key text,
  sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index mail_attachments_message_id_idx
  on private.mail_attachments (message_id);

create table private.mail_labels (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references private.mail_mailboxes(id) on delete cascade,
  name text not null,
  slug text not null,
  kind text not null default 'custom' check (kind in ('system', 'custom')),
  color text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mailbox_id, slug)
);

create trigger set_mail_labels_updated_at
  before update on private.mail_labels
  for each row
  execute function private.set_mail_updated_at();

create table private.mail_message_labels (
  message_id uuid not null references private.mail_messages(id) on delete cascade,
  label_id uuid not null references private.mail_labels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, label_id)
);

create index mail_message_labels_label_id_idx
  on private.mail_message_labels (label_id);

create table private.mail_message_user_state (
  message_id uuid not null references private.mail_messages(id) on delete cascade,
  mailbox_id uuid not null references private.mail_mailboxes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  read_at timestamptz,
  starred_at timestamptz,
  archived_at timestamptz,
  trashed_at timestamptz,
  snoozed_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index mail_message_user_state_user_mailbox_idx
  on private.mail_message_user_state (user_id, mailbox_id);

create trigger set_mail_message_user_state_updated_at
  before update on private.mail_message_user_state
  for each row
  execute function private.set_mail_updated_at();

create table private.mail_events (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid references private.mail_mailboxes(id) on delete cascade,
  message_id uuid references private.mail_messages(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index mail_events_mailbox_created_idx
  on private.mail_events (mailbox_id, created_at desc);

create table private.mail_inbound_jobs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'ses',
  provider_message_id text not null,
  s3_bucket text,
  s3_key text,
  sns_topic_arn text,
  receipt_recipients text[] not null default '{}'::text[],
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'imported', 'quarantined', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_message_id)
);

create unique index mail_inbound_jobs_s3_object_key
  on private.mail_inbound_jobs (s3_bucket, s3_key)
  where s3_bucket is not null and s3_key is not null;

create trigger set_mail_inbound_jobs_updated_at
  before update on private.mail_inbound_jobs
  for each row
  execute function private.set_mail_updated_at();

create table private.mail_outbound_jobs (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references private.mail_mailboxes(id) on delete cascade,
  message_id uuid not null references private.mail_messages(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  provider text not null default 'ses',
  provider_message_id text,
  recipients jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  error_message text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mail_outbound_jobs_status_idx
  on private.mail_outbound_jobs (status, queued_at);

create trigger set_mail_outbound_jobs_updated_at
  before update on private.mail_outbound_jobs
  for each row
  execute function private.set_mail_updated_at();

alter table private.mail_mailboxes enable row level security;
alter table private.mail_mailbox_members enable row level security;
alter table private.mail_raw_messages enable row level security;
alter table private.mail_threads enable row level security;
alter table private.mail_messages enable row level security;
alter table private.mail_recipients enable row level security;
alter table private.mail_attachments enable row level security;
alter table private.mail_labels enable row level security;
alter table private.mail_message_labels enable row level security;
alter table private.mail_message_user_state enable row level security;
alter table private.mail_events enable row level security;
alter table private.mail_inbound_jobs enable row level security;
alter table private.mail_outbound_jobs enable row level security;

revoke all on table
  private.mail_mailboxes,
  private.mail_mailbox_members,
  private.mail_raw_messages,
  private.mail_threads,
  private.mail_messages,
  private.mail_recipients,
  private.mail_attachments,
  private.mail_labels,
  private.mail_message_labels,
  private.mail_message_user_state,
  private.mail_events,
  private.mail_inbound_jobs,
  private.mail_outbound_jobs
from anon, authenticated;

grant select, insert, update, delete on table
  private.mail_mailboxes,
  private.mail_mailbox_members,
  private.mail_raw_messages,
  private.mail_threads,
  private.mail_messages,
  private.mail_recipients,
  private.mail_attachments,
  private.mail_labels,
  private.mail_message_labels,
  private.mail_message_user_state,
  private.mail_events,
  private.mail_inbound_jobs,
  private.mail_outbound_jobs
to service_role;

comment on table private.mail_mailboxes is 'Exact @tuturuuu.com mailboxes exposed only through centralized mail APIs.';
comment on table private.mail_raw_messages is 'SES inbound raw-message mirror metadata; raw MIME stays in S3 or protected storage.';
comment on table private.mail_inbound_jobs is 'Idempotent SES receiving job ledger keyed by provider message id and S3 object.';
comment on table private.mail_outbound_jobs is 'Outbound send ledger for mailbox sends through the shared SES email service.';
