begin;
set local lock_timeout = '5s';

-- Per-workspace CMS delivery version. Every write to a table that feeds the
-- published delivery payload, the binding, or the site template bumps the
-- workspace's counter in the same transaction, so the counter changes exactly
-- when the content does. Edge caches key on it, which makes a publish,
-- unpublish, hard delete or import visible at the next version read without a
-- purge call. Draft edits bump it too: that over-invalidates but is safe,
-- because drafts are never cached.
create table private.workspace_external_project_delivery_versions (
  ws_id uuid primary key references public.workspaces(id) on delete cascade,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table private.workspace_external_project_delivery_versions
  enable row level security;

revoke all on private.workspace_external_project_delivery_versions
  from public, anon, authenticated, service_role;
-- Writes happen only through the definer functions below.
grant select on private.workspace_external_project_delivery_versions
  to service_role;

-- One upsert per distinct workspace. Ids are locked in sorted order so two
-- statements that touch the same workspaces cannot deadlock. A workspace that
-- is being deleted has no row left in public.workspaces, so a cascading
-- delete does not insert a counter row that references it.
create function private.bump_workspace_external_project_delivery_versions(
  p_ws_ids uuid[]
)
returns void
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$
  insert into private.workspace_external_project_delivery_versions as v
    (ws_id, version, updated_at)
  select w.id, 1, now()
  from public.workspaces as w
  where w.id = any(p_ws_ids)
  order by w.id
  on conflict (ws_id) do update
    set version = v.version + 1, updated_at = now()
$$;

-- tuturuuu: no-grant (internal)
revoke all on function private.bump_workspace_external_project_delivery_versions(uuid[])
  from public, anon, authenticated, service_role;

-- Statement-level trigger body for tables that carry ws_id. The transition
-- tables are named old_rows and new_rows by the CREATE TRIGGER statements.
create function private.bump_external_project_delivery_versions()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_ws_ids uuid[];
begin
  if tg_op = 'INSERT' then
    select coalesce(array_agg(distinct n.ws_id), '{}') into v_ws_ids
    from new_rows as n where n.ws_id is not null;
  elsif tg_op = 'DELETE' then
    select coalesce(array_agg(distinct o.ws_id), '{}') into v_ws_ids
    from old_rows as o where o.ws_id is not null;
  else
    select coalesce(array_agg(distinct c.ws_id), '{}') into v_ws_ids
    from (
      select o.ws_id from old_rows as o
      union
      select n.ws_id from new_rows as n
    ) as c
    where c.ws_id is not null;
  end if;
  if cardinality(v_ws_ids) > 0 then
    perform private.bump_workspace_external_project_delivery_versions(v_ws_ids);
  end if;
  return null;
end;
$$;

-- tuturuuu: no-grant (trigger)
revoke all on function private.bump_external_project_delivery_versions()
  from public, anon, authenticated, service_role;

-- The legacy binding fallback reads two workspace secrets; only those two
-- names affect delivery.
create function private.bump_external_project_delivery_versions_for_secrets()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_ws_ids uuid[];
begin
  if tg_op = 'INSERT' then
    select coalesce(array_agg(distinct n.ws_id), '{}') into v_ws_ids
    from new_rows as n
    where n.name in ('EXTERNAL_PROJECT_ENABLED', 'EXTERNAL_PROJECT_CANONICAL_ID');
  elsif tg_op = 'DELETE' then
    select coalesce(array_agg(distinct o.ws_id), '{}') into v_ws_ids
    from old_rows as o
    where o.name in ('EXTERNAL_PROJECT_ENABLED', 'EXTERNAL_PROJECT_CANONICAL_ID');
  else
    select coalesce(array_agg(distinct c.ws_id), '{}') into v_ws_ids
    from (
      select o.ws_id, o.name from old_rows as o
      union
      select n.ws_id, n.name from new_rows as n
    ) as c
    where c.name in ('EXTERNAL_PROJECT_ENABLED', 'EXTERNAL_PROJECT_CANONICAL_ID');
  end if;
  if cardinality(v_ws_ids) > 0 then
    perform private.bump_workspace_external_project_delivery_versions(v_ws_ids);
  end if;
  return null;
end;
$$;

-- tuturuuu: no-grant (trigger)
revoke all on function private.bump_external_project_delivery_versions_for_secrets()
  from public, anon, authenticated, service_role;

-- A canonical project row carries the adapter, the activation flag and the
-- delivery profile (including its template) of every workspace bound to it.
create function private.bump_external_project_delivery_versions_for_canonical()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_ws_ids uuid[];
begin
  select coalesce(array_agg(distinct b.ws_id), '{}') into v_ws_ids
  from public.workspace_external_project_bindings as b
  where b.canonical_project_id in (
    select o.id from old_rows as o
    union
    select n.id from new_rows as n
  );
  if cardinality(v_ws_ids) > 0 then
    perform private.bump_workspace_external_project_delivery_versions(v_ws_ids);
  end if;
  return null;
end;
$$;

-- tuturuuu: no-grant (trigger)
revoke all on function private.bump_external_project_delivery_versions_for_canonical()
  from public, anon, authenticated, service_role;

create trigger cms_delivery_version_ins
  after insert on public.workspace_external_project_collections
  referencing new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_upd
  after update on public.workspace_external_project_collections
  referencing old table as old_rows new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_del
  after delete on public.workspace_external_project_collections
  referencing old table as old_rows for each statement
  execute function private.bump_external_project_delivery_versions();


create trigger cms_delivery_version_ins
  after insert on public.workspace_external_project_entries
  referencing new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_upd
  after update on public.workspace_external_project_entries
  referencing old table as old_rows new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_del
  after delete on public.workspace_external_project_entries
  referencing old table as old_rows for each statement
  execute function private.bump_external_project_delivery_versions();


create trigger cms_delivery_version_ins
  after insert on public.workspace_external_project_blocks
  referencing new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_upd
  after update on public.workspace_external_project_blocks
  referencing old table as old_rows new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_del
  after delete on public.workspace_external_project_blocks
  referencing old table as old_rows for each statement
  execute function private.bump_external_project_delivery_versions();


create trigger cms_delivery_version_ins
  after insert on public.workspace_external_project_assets
  referencing new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_upd
  after update on public.workspace_external_project_assets
  referencing old table as old_rows new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_del
  after delete on public.workspace_external_project_assets
  referencing old table as old_rows for each statement
  execute function private.bump_external_project_delivery_versions();


create trigger cms_delivery_version_ins
  after insert on public.workspace_external_project_entry_relations
  referencing new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_upd
  after update on public.workspace_external_project_entry_relations
  referencing old table as old_rows new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_del
  after delete on public.workspace_external_project_entry_relations
  referencing old table as old_rows for each statement
  execute function private.bump_external_project_delivery_versions();


create trigger cms_delivery_version_ins
  after insert on public.workspace_external_project_relation_definitions
  referencing new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_upd
  after update on public.workspace_external_project_relation_definitions
  referencing old table as old_rows new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_del
  after delete on public.workspace_external_project_relation_definitions
  referencing old table as old_rows for each statement
  execute function private.bump_external_project_delivery_versions();


create trigger cms_delivery_version_ins
  after insert on public.workspace_external_project_relation_definition_targets
  referencing new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_upd
  after update on public.workspace_external_project_relation_definition_targets
  referencing old table as old_rows new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_del
  after delete on public.workspace_external_project_relation_definition_targets
  referencing old table as old_rows for each statement
  execute function private.bump_external_project_delivery_versions();


create trigger cms_delivery_version_ins
  after insert on public.workspace_external_project_field_definitions
  referencing new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_upd
  after update on public.workspace_external_project_field_definitions
  referencing old table as old_rows new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_del
  after delete on public.workspace_external_project_field_definitions
  referencing old table as old_rows for each statement
  execute function private.bump_external_project_delivery_versions();


create trigger cms_delivery_version_ins
  after insert on public.workspace_external_project_page_versions
  referencing new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_upd
  after update on public.workspace_external_project_page_versions
  referencing old table as old_rows new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_del
  after delete on public.workspace_external_project_page_versions
  referencing old table as old_rows for each statement
  execute function private.bump_external_project_delivery_versions();


create trigger cms_delivery_version_ins
  after insert on public.workspace_external_project_publish_events
  referencing new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_upd
  after update on public.workspace_external_project_publish_events
  referencing old table as old_rows new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_del
  after delete on public.workspace_external_project_publish_events
  referencing old table as old_rows for each statement
  execute function private.bump_external_project_delivery_versions();


create trigger cms_delivery_version_ins
  after insert on public.workspace_external_project_bindings
  referencing new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_upd
  after update on public.workspace_external_project_bindings
  referencing old table as old_rows new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_del
  after delete on public.workspace_external_project_bindings
  referencing old table as old_rows for each statement
  execute function private.bump_external_project_delivery_versions();


create trigger cms_delivery_version_ins
  after insert on private.external_project_asset_publication_proofs
  referencing new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_upd
  after update on private.external_project_asset_publication_proofs
  referencing old table as old_rows new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions();

create trigger cms_delivery_version_del
  after delete on private.external_project_asset_publication_proofs
  referencing old table as old_rows for each statement
  execute function private.bump_external_project_delivery_versions();


create trigger cms_delivery_version_ins
  after insert on public.workspace_secrets
  referencing new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions_for_secrets();
create trigger cms_delivery_version_upd
  after update on public.workspace_secrets
  referencing old table as old_rows new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions_for_secrets();
create trigger cms_delivery_version_del
  after delete on public.workspace_secrets
  referencing old table as old_rows for each statement
  execute function private.bump_external_project_delivery_versions_for_secrets();

create trigger cms_delivery_version_upd
  after update on public.canonical_external_projects
  referencing old table as old_rows new table as new_rows for each statement
  execute function private.bump_external_project_delivery_versions_for_canonical();

-- One round trip for the delivery route: the binding as the route resolves
-- it (the binding row, else the legacy secrets), the canonical project, a
-- fingerprint of everything the route derives the payload from, and the
-- workspace's delivery version (0 until the first write).
create function private.get_external_project_delivery_state(p_ws_id uuid)
returns table (
  enabled boolean,
  canonical_id text,
  adapter text,
  canonical_project jsonb,
  settings jsonb,
  binding_fingerprint text,
  version bigint
)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
set timezone = 'UTC'
as $$
  with b as (
    select
      x.canonical_project_id as canonical_id,
      coalesce(x.is_enabled, false) as enabled,
      x.settings
    from public.workspace_external_project_bindings as x
    where x.ws_id = p_ws_id
  ),
  s as (
    select
      max(x.value) filter (where x.name = 'EXTERNAL_PROJECT_CANONICAL_ID') as canonical_id,
      coalesce(bool_or(x.name = 'EXTERNAL_PROJECT_ENABLED' and x.value = 'true'), false) as enabled,
      null::jsonb as settings
    from public.workspace_secrets as x
    where x.ws_id = p_ws_id
      and x.name in ('EXTERNAL_PROJECT_ENABLED', 'EXTERNAL_PROJECT_CANONICAL_ID')
  ),
  src as (
    select b.canonical_id, b.enabled, b.settings from b
    union all
    select s.canonical_id, s.enabled, s.settings from s
    where not exists (select 1 from b)
  )
  select
    src.enabled and src.canonical_id is not null
      and coalesce(c.is_active, false) as enabled,
    src.canonical_id,
    c.adapter::text as adapter,
    case when src.enabled and coalesce(c.is_active, false)
      then to_jsonb(c) end as canonical_project,
    src.settings,
    left(md5(concat_ws('|',
      src.canonical_id,
      src.enabled::text,
      c.is_active::text,
      c.updated_at::text,
      c.delivery_profile::text,
      src.settings::text)), 16) as binding_fingerprint,
    coalesce((
      select v.version
      from private.workspace_external_project_delivery_versions as v
      where v.ws_id = p_ws_id
    ), 0) as version
  from src
  left join public.canonical_external_projects as c on c.id = src.canonical_id
$$;

revoke all on function private.get_external_project_delivery_state(uuid)
  from public, anon, authenticated;
grant execute on function private.get_external_project_delivery_state(uuid)
  to service_role;

-- Indexes for the delivery and studio reads: assets by entry (ordered) and by
-- block, the legacy binding secrets by (workspace, name), and relations by
-- definition. The existing relation indexes lead with the entry columns, so
-- none of these duplicates one.
create index if not exists workspace_external_project_assets_entry_idx
  on public.workspace_external_project_assets (entry_id, sort_order, id)
  where entry_id is not null;
create index if not exists workspace_external_project_assets_block_idx
  on public.workspace_external_project_assets (block_id)
  where block_id is not null;
create index if not exists workspace_secrets_ws_id_name_idx
  on public.workspace_secrets (ws_id, name);
create index if not exists workspace_external_project_entry_relations_definition_idx
  on public.workspace_external_project_entry_relations (ws_id, relation_definition_id)
  where relation_definition_id is not null;

notify pgrst, 'reload schema';
commit;
