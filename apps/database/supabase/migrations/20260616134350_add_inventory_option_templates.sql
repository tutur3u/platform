-- Reusable, workspace-level product option templates (e.g. an "Apparel Sizes"
-- template with values S/M/L) that an operator can apply to a storefront
-- listing. Templates are pure metadata: applying one COPIES its groups/values
-- into the listing's own option structure (snapshot semantics), so later edits
-- to a template never silently mutate already-published listings.
--
-- All additive; mirrors the service_role-only RLS/grant/trigger pattern used by
-- the rest of the private inventory commerce schema.

create table if not exists private.inventory_option_templates (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (ws_id, name)
);

create table if not exists private.inventory_option_template_groups (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references private.inventory_option_templates(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  unique (template_id, name)
);

create table if not exists private.inventory_option_template_values (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references private.inventory_option_template_groups(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  label text not null,
  value text,
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  unique (group_id, label)
);

create index if not exists inventory_option_templates_ws_idx
  on private.inventory_option_templates (ws_id, name);
create index if not exists inventory_option_template_groups_template_idx
  on private.inventory_option_template_groups (template_id, sort_order);
create index if not exists inventory_option_template_values_group_idx
  on private.inventory_option_template_values (group_id, sort_order);

alter table private.inventory_option_templates enable row level security;
alter table private.inventory_option_template_groups enable row level security;
alter table private.inventory_option_template_values enable row level security;

drop policy if exists "Service role can manage inventory option templates"
  on private.inventory_option_templates;
create policy "Service role can manage inventory option templates"
  on private.inventory_option_templates
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage inventory option template groups"
  on private.inventory_option_template_groups;
create policy "Service role can manage inventory option template groups"
  on private.inventory_option_template_groups
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage inventory option template values"
  on private.inventory_option_template_values;
create policy "Service role can manage inventory option template values"
  on private.inventory_option_template_values
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table private.inventory_option_templates
  from public, anon, authenticated;
revoke all on table private.inventory_option_template_groups
  from public, anon, authenticated;
revoke all on table private.inventory_option_template_values
  from public, anon, authenticated;

grant all on table private.inventory_option_templates to service_role;
grant all on table private.inventory_option_template_groups to service_role;
grant all on table private.inventory_option_template_values to service_role;

drop trigger if exists inventory_option_templates_updated_at
  on private.inventory_option_templates;
create trigger inventory_option_templates_updated_at
  before update
  on private.inventory_option_templates
  for each row
  execute function public.update_updated_at_column();
