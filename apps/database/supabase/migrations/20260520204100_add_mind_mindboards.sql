create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

create table if not exists private.mind_boards (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  creator_id uuid references public.users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  description text check (description is null or char_length(description) <= 4000),
  status text not null default 'active' check (status in ('active', 'archived')),
  default_horizon text not null default 'year' check (
    default_horizon in (
      'day',
      'week',
      'month',
      'quarter',
      'year',
      'five_year',
      'ten_year',
      'fifty_year',
      'long_arc'
    )
  ),
  canvas_view jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.mind_nodes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references private.mind_boards(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  parent_node_id uuid references private.mind_nodes(id) on delete set null,
  merged_into_node_id uuid references private.mind_nodes(id) on delete set null,
  title text not null check (char_length(title) between 1 and 240),
  body text check (body is null or char_length(body) <= 20000),
  node_type text not null default 'idea' check (
    node_type in (
      'decision',
      'goal',
      'idea',
      'milestone',
      'plan',
      'question',
      'resource',
      'risk',
      'system'
    )
  ),
  horizon text not null default 'year' check (
    horizon in (
      'day',
      'week',
      'month',
      'quarter',
      'year',
      'five_year',
      'ten_year',
      'fifty_year',
      'long_arc'
    )
  ),
  status text not null default 'planned' check (
    status in (
      'backlog',
      'planned',
      'in_progress',
      'in_review',
      'blocked',
      'completed',
      'deferred',
      'cancelled'
    )
  ),
  position_x double precision not null default 0,
  position_y double precision not null default 0,
  width double precision not null default 240 check (width > 0),
  height double precision not null default 120 check (height > 0),
  color text,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists private.mind_edges (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references private.mind_boards(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  source_node_id uuid not null references private.mind_nodes(id) on delete cascade,
  target_node_id uuid not null references private.mind_nodes(id) on delete cascade,
  edge_type text not null default 'relates_to' check (
    edge_type in (
      'blocks',
      'contains',
      'contradicts',
      'custom',
      'depends_on',
      'reference',
      'relates_to',
      'sequence',
      'supports'
    )
  ),
  label text check (label is null or char_length(label) <= 240),
  color text,
  weight double precision not null default 1 check (weight >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (source_node_id <> target_node_id)
);

create table if not exists private.mind_tags (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references private.mind_boards(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text,
  created_at timestamptz not null default now()
);

create table if not exists private.mind_node_tags (
  node_id uuid not null references private.mind_nodes(id) on delete cascade,
  tag_id uuid not null references private.mind_tags(id) on delete cascade,
  board_id uuid not null references private.mind_boards(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (node_id, tag_id)
);

create table if not exists private.mind_groups (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references private.mind_boards(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  color text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.mind_group_nodes (
  group_id uuid not null references private.mind_groups(id) on delete cascade,
  node_id uuid not null references private.mind_nodes(id) on delete cascade,
  board_id uuid not null references private.mind_boards(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, node_id)
);

create table if not exists private.mind_node_links (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references private.mind_boards(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  node_id uuid not null references private.mind_nodes(id) on delete cascade,
  entity_type text not null check (
    entity_type in (
      'calendar_event',
      'custom',
      'document',
      'external_url',
      'project',
      'task',
      'workspace'
    )
  ),
  entity_id text,
  url text,
  label text check (label is null or char_length(label) <= 240),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists private.mind_ai_threads (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  board_id uuid references private.mind_boards(id) on delete cascade,
  creator_id uuid references public.users(id) on delete set null,
  title text not null default 'Mind iteration',
  write_mode text not null default 'review' check (write_mode in ('direct', 'review')),
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.mind_ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references private.mind_ai_threads(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  board_id uuid references private.mind_boards(id) on delete cascade,
  creator_id uuid references public.users(id) on delete set null,
  role text not null check (role in ('assistant', 'system', 'tool', 'user')),
  content text not null default '',
  model text,
  tool_calls jsonb not null default '[]'::jsonb,
  tool_results jsonb not null default '[]'::jsonb,
  usage jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists private.mind_ai_patches (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references private.mind_ai_threads(id) on delete set null,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  board_id uuid not null references private.mind_boards(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  summary text not null check (char_length(summary) between 1 and 2000),
  patch jsonb not null,
  status text not null default 'draft' check (status in ('applied', 'draft', 'rejected')),
  metadata jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mind_boards_ws_status_updated_idx
  on private.mind_boards (ws_id, status, updated_at desc);
create index if not exists mind_nodes_board_active_idx
  on private.mind_nodes (board_id, updated_at desc)
  where deleted_at is null;
create index if not exists mind_nodes_parent_idx
  on private.mind_nodes (parent_node_id)
  where parent_node_id is not null;
create index if not exists mind_nodes_ws_horizon_idx
  on private.mind_nodes (ws_id, horizon)
  where deleted_at is null;
create index if not exists mind_nodes_ws_status_idx
  on private.mind_nodes (ws_id, status)
  where deleted_at is null;
create index if not exists mind_edges_board_active_idx
  on private.mind_edges (board_id, updated_at desc)
  where deleted_at is null;
create index if not exists mind_edges_source_idx
  on private.mind_edges (source_node_id)
  where deleted_at is null;
create index if not exists mind_edges_target_idx
  on private.mind_edges (target_node_id)
  where deleted_at is null;
create unique index if not exists mind_tags_board_name_key
  on private.mind_tags (board_id, lower(name));
create index if not exists mind_node_tags_tag_idx
  on private.mind_node_tags (tag_id);
create index if not exists mind_group_nodes_node_idx
  on private.mind_group_nodes (node_id);
create index if not exists mind_node_links_entity_idx
  on private.mind_node_links (ws_id, entity_type, entity_id);
create index if not exists mind_node_links_board_idx
  on private.mind_node_links (board_id, node_id);
create index if not exists mind_ai_threads_ws_board_idx
  on private.mind_ai_threads (ws_id, board_id, updated_at desc);
create index if not exists mind_ai_messages_thread_idx
  on private.mind_ai_messages (thread_id, created_at);
create index if not exists mind_ai_patches_board_status_idx
  on private.mind_ai_patches (board_id, status, created_at desc);

alter table private.mind_boards enable row level security;
alter table private.mind_nodes enable row level security;
alter table private.mind_edges enable row level security;
alter table private.mind_tags enable row level security;
alter table private.mind_node_tags enable row level security;
alter table private.mind_groups enable row level security;
alter table private.mind_group_nodes enable row level security;
alter table private.mind_node_links enable row level security;
alter table private.mind_ai_threads enable row level security;
alter table private.mind_ai_messages enable row level security;
alter table private.mind_ai_patches enable row level security;

drop policy if exists "Service role can manage mind boards" on private.mind_boards;
create policy "Service role can manage mind boards"
  on private.mind_boards for all to service_role using (true) with check (true);

drop policy if exists "Service role can manage mind nodes" on private.mind_nodes;
create policy "Service role can manage mind nodes"
  on private.mind_nodes for all to service_role using (true) with check (true);

drop policy if exists "Service role can manage mind edges" on private.mind_edges;
create policy "Service role can manage mind edges"
  on private.mind_edges for all to service_role using (true) with check (true);

drop policy if exists "Service role can manage mind tags" on private.mind_tags;
create policy "Service role can manage mind tags"
  on private.mind_tags for all to service_role using (true) with check (true);

drop policy if exists "Service role can manage mind node tags" on private.mind_node_tags;
create policy "Service role can manage mind node tags"
  on private.mind_node_tags for all to service_role using (true) with check (true);

drop policy if exists "Service role can manage mind groups" on private.mind_groups;
create policy "Service role can manage mind groups"
  on private.mind_groups for all to service_role using (true) with check (true);

drop policy if exists "Service role can manage mind group nodes" on private.mind_group_nodes;
create policy "Service role can manage mind group nodes"
  on private.mind_group_nodes for all to service_role using (true) with check (true);

drop policy if exists "Service role can manage mind node links" on private.mind_node_links;
create policy "Service role can manage mind node links"
  on private.mind_node_links for all to service_role using (true) with check (true);

drop policy if exists "Service role can manage mind ai threads" on private.mind_ai_threads;
create policy "Service role can manage mind ai threads"
  on private.mind_ai_threads for all to service_role using (true) with check (true);

drop policy if exists "Service role can manage mind ai messages" on private.mind_ai_messages;
create policy "Service role can manage mind ai messages"
  on private.mind_ai_messages for all to service_role using (true) with check (true);

drop policy if exists "Service role can manage mind ai patches" on private.mind_ai_patches;
create policy "Service role can manage mind ai patches"
  on private.mind_ai_patches for all to service_role using (true) with check (true);

revoke all on table private.mind_boards from public, anon, authenticated;
revoke all on table private.mind_nodes from public, anon, authenticated;
revoke all on table private.mind_edges from public, anon, authenticated;
revoke all on table private.mind_tags from public, anon, authenticated;
revoke all on table private.mind_node_tags from public, anon, authenticated;
revoke all on table private.mind_groups from public, anon, authenticated;
revoke all on table private.mind_group_nodes from public, anon, authenticated;
revoke all on table private.mind_node_links from public, anon, authenticated;
revoke all on table private.mind_ai_threads from public, anon, authenticated;
revoke all on table private.mind_ai_messages from public, anon, authenticated;
revoke all on table private.mind_ai_patches from public, anon, authenticated;

grant all on table private.mind_boards to service_role;
grant all on table private.mind_nodes to service_role;
grant all on table private.mind_edges to service_role;
grant all on table private.mind_tags to service_role;
grant all on table private.mind_node_tags to service_role;
grant all on table private.mind_groups to service_role;
grant all on table private.mind_group_nodes to service_role;
grant all on table private.mind_node_links to service_role;
grant all on table private.mind_ai_threads to service_role;
grant all on table private.mind_ai_messages to service_role;
grant all on table private.mind_ai_patches to service_role;

drop trigger if exists mind_boards_updated_at on private.mind_boards;
create trigger mind_boards_updated_at
  before update on private.mind_boards
  for each row execute function public.update_updated_at_column();

drop trigger if exists mind_nodes_updated_at on private.mind_nodes;
create trigger mind_nodes_updated_at
  before update on private.mind_nodes
  for each row execute function public.update_updated_at_column();

drop trigger if exists mind_edges_updated_at on private.mind_edges;
create trigger mind_edges_updated_at
  before update on private.mind_edges
  for each row execute function public.update_updated_at_column();

drop trigger if exists mind_groups_updated_at on private.mind_groups;
create trigger mind_groups_updated_at
  before update on private.mind_groups
  for each row execute function public.update_updated_at_column();

drop trigger if exists mind_ai_threads_updated_at on private.mind_ai_threads;
create trigger mind_ai_threads_updated_at
  before update on private.mind_ai_threads
  for each row execute function public.update_updated_at_column();

drop trigger if exists mind_ai_patches_updated_at on private.mind_ai_patches;
create trigger mind_ai_patches_updated_at
  before update on private.mind_ai_patches
  for each row execute function public.update_updated_at_column();
