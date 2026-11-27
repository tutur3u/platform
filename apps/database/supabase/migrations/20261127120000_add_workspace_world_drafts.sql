create table private.workspace_world_drafts (
  ws_id uuid not null references public.workspaces (id) on delete cascade,
  world_id text not null check (world_id = 'edufest-hall'),
  revision integer not null check (revision > 0),
  geometry jsonb not null check (jsonb_typeof(geometry) = 'array'),
  primary key (ws_id, world_id)
);

alter table private.workspace_world_drafts enable row level security;
revoke all on private.workspace_world_drafts from public, anon, authenticated, service_role;
grant select, insert, update on private.workspace_world_drafts to service_role;
