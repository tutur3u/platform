-- Disposable PostgreSQL boundary fixture for CMS page versions, not a full
-- Supabase schema. Workspace permission is a reduced stand-in (creator, or
-- member with an enabled role permission, or admin); the external project
-- helpers and the page-version migration load from the real migrations.
create schema auth;
create schema extensions;
create role anon;
create role authenticated;
create role service_role bypassrls;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid
$$;
-- Synthetic MFA boundary; the full contract job uses the real account helper.
create function public.account_required_mfa_satisfied() returns boolean language sql stable as $$
  select coalesce(nullif(current_setting('test.cms_mfa_satisfied', true), ''), 'true')::boolean
$$;
create table auth.users(id uuid primary key);
create table public.users(id uuid primary key);
create table public.workspaces(id uuid primary key, name text, personal boolean, creator_id uuid);
create table public.workspace_members(ws_id uuid, user_id uuid, type text, primary key (ws_id, user_id));
create type public.workspace_role_permission as enum ('admin', 'manage_external_projects', 'publish_external_projects');
create table public.workspace_default_permissions(ws_id uuid, permission public.workspace_role_permission, enabled boolean);
create table public.workspace_roles(id uuid primary key, ws_id uuid, name text);
create table public.workspace_role_permissions(ws_id uuid, role_id uuid, permission public.workspace_role_permission, enabled boolean);
create table public.workspace_role_members(role_id uuid, user_id uuid);
create function public.has_workspace_permission(p_ws_id uuid, p_user_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from public.workspaces w where w.id = p_ws_id and w.creator_id = p_user_id)
    or (
      exists (select 1 from public.workspace_members m
        where m.ws_id = p_ws_id and m.user_id = p_user_id and m.type = 'MEMBER')
      and exists (select 1 from public.workspace_role_members rm
        join public.workspace_role_permissions rp on rp.role_id = rm.role_id and rp.ws_id = p_ws_id
        where rm.user_id = p_user_id and rp.enabled
          and rp.permission in (p_permission::public.workspace_role_permission, 'admin'))
    )
$$;
create table public.canonical_external_projects(id text primary key, display_name text, adapter text);
create table public.workspace_external_project_bindings(
  ws_id uuid primary key references public.workspaces(id) on delete cascade,
  canonical_project_id text references public.canonical_external_projects(id), is_enabled boolean not null default false
);
create type public.external_project_publish_event_kind as enum ('publish', 'preview', 'unpublish');
create table public.workspace_external_project_publish_events(
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  canonical_external_project_id text not null references public.canonical_external_projects(id),
  entry_id uuid, event_kind public.external_project_publish_event_kind not null default 'publish',
  visibility_scope text not null default 'public', payload jsonb not null default '{}',
  triggered_by uuid, created_at timestamptz not null default now()
);
alter table public.workspace_external_project_publish_events enable row level security;
grant select, insert on public.workspace_external_project_publish_events to authenticated, service_role;
create table public.workspace_external_project_collections(
  id uuid primary key, ws_id uuid not null references public.workspaces(id) on delete cascade,
  slug text, title text, collection_type text
);
-- The entry columns the page-version migration reads and writes.
create table public.workspace_external_project_entries(
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  collection_id uuid not null references public.workspace_external_project_collections(id),
  slug text not null, title text not null,
  status text not null default 'draft', published_at timestamptz,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);
create unique index workspace_external_project_entries_ws_id_key
  on public.workspace_external_project_entries (ws_id, id);
alter table public.workspace_external_project_entries enable row level security;
grant select, insert, update, delete on public.workspace_external_project_entries to authenticated, service_role;
