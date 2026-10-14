-- Disposable PostgreSQL boundary fixture, not a full Supabase schema.
create schema private;
create schema auth;
create schema extensions;
create schema net;
create role anon;
create role authenticated;
create role service_role;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, banned_until timestamptz);
create table public.users(id uuid primary key);
create table private.mail_domains(id uuid primary key, domain text, status text, verified_at timestamptz, canonical_domain_id uuid, inbound_provider text default 'cloudflare');
create table private.mail_mailboxes(id uuid primary key, domain_id uuid references private.mail_domains, address text, status text default 'active');
create table private.mail_mailbox_members(mailbox_id uuid references private.mail_mailboxes, user_id uuid references public.users, primary key(mailbox_id,user_id));
create table private.mail_threads(id uuid primary key, mailbox_id uuid references private.mail_mailboxes);
create table private.mail_labels(id uuid primary key, mailbox_id uuid references private.mail_mailboxes, slug text, kind text);
create table private.mail_raw_messages(id uuid primary key, status text default 'imported', provider text default 'cloudflare', provider_message_id text, provider_payload jsonb, spam_verdict text, virus_verdict text);
create table private.mail_messages(
 id uuid primary key default gen_random_uuid(), mailbox_id uuid references private.mail_mailboxes,
 thread_id uuid references private.mail_threads, raw_message_id uuid references private.mail_raw_messages,
 provider_message_id text, ingress_domain_id uuid, envelope_to text, observed_recipient text,
 direction text default 'inbound', status text default 'received', provider text default 'cloudflare',
 from_name text, from_address text default 'synthetic@example.invalid', subject text default 'Fixture',
 received_at timestamptz default now(), created_at timestamptz default now(), metadata jsonb default '{}'
);
create table private.mail_message_labels(message_id uuid references private.mail_messages, label_id uuid references private.mail_labels, primary key(message_id,label_id));
create table private.mail_message_user_state(message_id uuid, mailbox_id uuid, user_id uuid, read_at timestamptz, archived_at timestamptz, trashed_at timestamptz);
create table public.notifications(
 id uuid primary key default gen_random_uuid(), user_id uuid references public.users, ws_id uuid,
 type text, code text, title text, description text, data jsonb, entity_type text, entity_id uuid,
 scope text, priority text, read_at timestamptz, created_at timestamptz default now()
);
create table private.notification_batches(
 id uuid primary key default gen_random_uuid(), user_id uuid, ws_id uuid, channel text,
 status text, window_start timestamptz, window_end timestamptz, notification_count integer,
 delivery_mode text, error_message text, created_at timestamptz default now(),
 updated_at timestamptz default now(), sent_at timestamptz
);
create table private.notification_delivery_log(
 notification_id uuid references public.notifications, channel text, status text,
 batch_id uuid references private.notification_batches, retry_count integer default 0, updated_at timestamptz default now()
);
create table public.fixture_notification_preferences(user_id uuid, event_type text, enabled boolean);
create function public.should_send_notification(uuid,text,text,text,uuid) returns boolean language sql stable as $$
 select not exists(select 1 from public.fixture_notification_preferences where user_id=$1 and event_type=$2 and enabled=false)
$$;
-- Only the network transport is stubbed. The canonical event trigger runs.
create table public.fixture_http_events(id bigint generated always as identity, body jsonb);
create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language plpgsql as $$
 declare request_id bigint;
 begin insert into public.fixture_http_events(body) values(body) returning id into request_id; return request_id; end;
$$;
