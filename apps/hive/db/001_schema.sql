create extension if not exists pgcrypto;

create table if not exists hive_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hive_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  enabled boolean not null default true,
  max_players integer not null default 32 check (max_players between 1 and 256),
  created_by uuid,
  total_currency numeric(18, 2) not null default 10000 check (total_currency >= 0),
  settings jsonb not null default '{
    "autonomousNpcEnabled": false,
    "cronEnabled": false,
    "llmProvider": "disabled",
    "maxLlmSpendPerTick": 0,
    "maxTickBudget": 50,
    "ollamaEnabled": false,
    "ollamaKeepAlive": "5m",
    "ollamaModel": "gemma4",
    "simulationCronEnabled": false,
    "tickIntervalSeconds": 300
  }'::jsonb,
  ollama_state jsonb not null default '{"loaded": false, "model": "gemma4"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hive_world_states (
  server_id uuid primary key references hive_servers(id) on delete cascade,
  op_seq bigint not null default 0,
  revision bigint generated always as (op_seq) stored,
  world_data jsonb not null default '{"blocks": [], "objects": []}'::jsonb,
  crdt_state bytea,
  crdt_state_vector bytea,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists hive_world_events (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references hive_servers(id) on delete cascade,
  actor_user_id uuid,
  op_seq bigint not null,
  revision bigint generated always as (op_seq) stored,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  world_data jsonb,
  created_at timestamptz not null default now(),
  unique (server_id, op_seq)
);

create index if not exists hive_world_events_server_op_seq_idx
  on hive_world_events(server_id, op_seq desc);

create table if not exists hive_crdt_updates (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references hive_servers(id) on delete cascade,
  actor_user_id uuid,
  op_seq bigint not null,
  update_data bytea not null,
  state_vector bytea,
  update_size integer not null,
  created_at timestamptz not null default now()
);

create index if not exists hive_crdt_updates_server_op_seq_idx
  on hive_crdt_updates(server_id, op_seq);

create table if not exists hive_npcs (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references hive_servers(id) on delete cascade,
  created_by uuid,
  name text not null,
  role text not null default 'resident',
  model text not null default 'gemini-2.5-flash-lite',
  backstory text not null default '',
  system_prompt text not null default '',
  memory_enabled boolean not null default true,
  backstory_enabled boolean not null default true,
  custom_prompt_enabled boolean not null default false,
  position jsonb not null default '{"x": 0, "y": 1, "z": 0}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'eliminated')),
  eliminated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hive_npcs_server_idx on hive_npcs(server_id, created_at);

create table if not exists hive_npc_needs (
  npc_id uuid primary key references hive_npcs(id) on delete cascade,
  hunger integer not null default 60 check (hunger between 0 and 100),
  energy integer not null default 70 check (energy between 0 and 100),
  morale integer not null default 70 check (morale between 0 and 100),
  updated_at timestamptz not null default now()
);

create table if not exists hive_npc_wallets (
  npc_id uuid primary key references hive_npcs(id) on delete cascade,
  balance numeric(18, 2) not null default 100 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists hive_npc_memories (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references hive_servers(id) on delete cascade,
  npc_id uuid not null references hive_npcs(id) on delete cascade,
  source_run_id uuid,
  created_by uuid,
  content text not null,
  importance integer not null default 1,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists hive_npc_memories_npc_idx
  on hive_npc_memories(npc_id, enabled, importance desc);

create table if not exists hive_npc_runs (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references hive_servers(id) on delete cascade,
  npc_id uuid not null references hive_npcs(id) on delete cascade,
  actor_user_id uuid,
  prompt_mode text not null default 'enhanced',
  input_context jsonb not null default '{}'::jsonb,
  output_decision jsonb not null default '{}'::jsonb,
  llm_provider text not null default 'disabled',
  llm_model text,
  llm_cost numeric(18, 4) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists hive_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references hive_servers(id) on delete cascade,
  actor_npc_id uuid references hive_npcs(id) on delete set null,
  counterparty_npc_id uuid references hive_npcs(id) on delete set null,
  amount numeric(18, 2) not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists hive_ledger_entries_server_idx
  on hive_ledger_entries(server_id, created_at desc);

create table if not exists hive_inventory_items (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references hive_servers(id) on delete cascade,
  owner_type text not null check (owner_type in ('npc', 'warehouse')),
  owner_id uuid not null,
  item_type text not null,
  quantity integer not null check (quantity > 0),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (server_id, owner_type, owner_id, item_type)
);

create table if not exists hive_warehouses (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references hive_servers(id) on delete cascade,
  name text not null,
  position jsonb not null default '{"x": 0, "y": 1, "z": 0}'::jsonb,
  capacity integer not null default 500 check (capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hive_trade_offers (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references hive_servers(id) on delete cascade,
  from_npc_id uuid not null references hive_npcs(id) on delete cascade,
  to_npc_id uuid references hive_npcs(id) on delete cascade,
  offered_items jsonb not null default '[]'::jsonb,
  requested_items jsonb not null default '[]'::jsonb,
  offered_currency numeric(18, 2) not null default 0,
  requested_currency numeric(18, 2) not null default 0,
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected', 'cancelled')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hive_crop_instances (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references hive_servers(id) on delete cascade,
  crop_type text not null default 'turnip',
  position jsonb not null,
  growth_stage integer not null default 0,
  max_growth_stage integer not null default 4,
  watered_at timestamptz,
  needs_water boolean not null default true,
  health integer not null default 100 check (health between 0 and 100),
  planted_by_npc_id uuid references hive_npcs(id) on delete set null,
  planted_at timestamptz not null default now(),
  ready_at timestamptz,
  harvested_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists hive_crop_instances_server_idx
  on hive_crop_instances(server_id, harvested_at, planted_at);

create table if not exists hive_simulation_ticks (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references hive_servers(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'completed', 'skipped', 'failed')),
  actions_count integer not null default 0,
  llm_spend numeric(18, 4) not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error text
);
