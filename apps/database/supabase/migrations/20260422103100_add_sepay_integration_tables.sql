create table if not exists public.sepay_connections (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  sepay_company_id text,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  access_token_expires_at timestamptz not null,
  scopes text[] not null default '{}'::text[],
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sepay_connections_status_check
    check (status in ('active', 'revoked', 'error')),
  constraint sepay_connections_ws_id_key unique (ws_id)
);

create table if not exists public.sepay_wallet_links (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  sepay_bank_account_id text not null,
  sepay_sub_account_id text,
  sepay_account_number text,
  sepay_gateway text,
  wallet_id uuid not null references public.workspace_wallets(id) on delete cascade,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sepay_wallet_links_metadata_is_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.sepay_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  wallet_id uuid references public.workspace_wallets(id) on delete set null,
  token_hash text not null,
  token_prefix text not null,
  active boolean not null default true,
  sepay_webhook_id text,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  last_used_at timestamptz,
  constraint sepay_webhook_endpoints_token_hash_key unique (token_hash)
);

create table if not exists public.sepay_webhook_events (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  wallet_id uuid not null references public.workspace_wallets(id) on delete cascade,
  endpoint_id uuid not null references public.sepay_webhook_endpoints(id),
  sepay_event_id text,
  reference_code text,
  transfer_type text not null,
  transfer_amount numeric not null,
  transaction_date timestamptz not null,
  payload jsonb not null,
  status text not null default 'received',
  failure_reason text,
  created_transaction_id uuid references public.wallet_transactions(id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint sepay_webhook_events_transfer_type_check
    check (transfer_type in ('in', 'out')),
  constraint sepay_webhook_events_transfer_amount_nonnegative_check
    check (transfer_amount >= 0),
  constraint sepay_webhook_events_status_check
    check (status in ('received', 'processed', 'duplicate', 'failed'))
);

create unique index if not exists idx_sepay_wallet_links_ws_bank_sub_unique
  on public.sepay_wallet_links (ws_id, sepay_bank_account_id, sepay_sub_account_id)
  where sepay_sub_account_id is not null;

create unique index if not exists idx_sepay_wallet_links_ws_bank_unique_when_no_sub
  on public.sepay_wallet_links (ws_id, sepay_bank_account_id)
  where sepay_sub_account_id is null;

create index if not exists idx_sepay_wallet_links_ws_active
  on public.sepay_wallet_links (ws_id, active);

create index if not exists idx_sepay_wallet_links_wallet_id
  on public.sepay_wallet_links (wallet_id);

create index if not exists idx_sepay_webhook_endpoints_ws_active
  on public.sepay_webhook_endpoints (ws_id, active);

create index if not exists idx_sepay_webhook_endpoints_wallet_id
  on public.sepay_webhook_endpoints (wallet_id);

create unique index if not exists idx_sepay_webhook_events_dedupe_event_id
  on public.sepay_webhook_events (ws_id, wallet_id, sepay_event_id)
  where sepay_event_id is not null;

create unique index if not exists idx_sepay_webhook_events_dedupe_fallback
  on public.sepay_webhook_events (
    ws_id,
    wallet_id,
    reference_code,
    transfer_type,
    transfer_amount,
    transaction_date
  )
  where sepay_event_id is null and reference_code is not null;

create index if not exists idx_sepay_webhook_events_status_received_at
  on public.sepay_webhook_events (status, received_at desc);

create index if not exists idx_sepay_webhook_events_endpoint_id
  on public.sepay_webhook_events (endpoint_id);

create index if not exists idx_sepay_webhook_events_created_transaction_id
  on public.sepay_webhook_events (created_transaction_id);

alter table public.sepay_connections enable row level security;
alter table public.sepay_wallet_links enable row level security;
alter table public.sepay_webhook_endpoints enable row level security;
alter table public.sepay_webhook_events enable row level security;

drop trigger if exists sepay_connections_updated_at
  on public.sepay_connections;

create trigger sepay_connections_updated_at
  before update on public.sepay_connections
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists sepay_wallet_links_updated_at
  on public.sepay_wallet_links;

create trigger sepay_wallet_links_updated_at
  before update on public.sepay_wallet_links
  for each row
  execute function public.update_updated_at_column();

comment on table public.sepay_connections is
  'Workspace-scoped SePay OAuth credentials and connection state.';

comment on table public.sepay_wallet_links is
  'Mapping between SePay account identifiers and workspace wallets.';

comment on table public.sepay_webhook_endpoints is
  'Workspace webhook token contexts for SePay deliveries. Token values are stored as hashes only.';

comment on table public.sepay_webhook_events is
  'Auditable SePay webhook events with idempotency and processing state tracking.';
