-- Connected accounts remain separate from managed domains and shared mailboxes.
create table private.mail_connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  provider_account_id text not null,
  address text not null,
  credentials text not null,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, ws_id, provider, provider_account_id)
);
create table private.mail_oauth_requests (
  state_hash text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  verifier text not null,
  expires_at timestamptz not null
);
create table private.mail_connected_sends (
  account_id uuid not null references private.mail_connected_accounts(id) on delete cascade,
  request_id uuid not null,
  payload_hash text not null,
  status text not null check (status in ('sending', 'sent', 'uncertain')),
  primary key (account_id, request_id)
);
alter table private.mail_connected_accounts enable row level security;
alter table private.mail_oauth_requests enable row level security;
alter table private.mail_connected_sends enable row level security;
revoke all on private.mail_connected_accounts, private.mail_oauth_requests, private.mail_connected_sends from public, anon, authenticated;
grant all on private.mail_connected_accounts, private.mail_oauth_requests, private.mail_connected_sends to service_role;
