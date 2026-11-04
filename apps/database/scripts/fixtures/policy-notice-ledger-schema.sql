-- Synthetic minimal schema for the policy notice ledger regression.
-- Only the columns the ledger functions read. All addresses are fixtures.
create schema if not exists private;
create schema if not exists auth;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema private, public to service_role, authenticated, anon;

create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  deleted_at timestamptz,
  banned_until timestamptz,
  is_anonymous boolean not null default false
);

create type public.workspace_member_type as enum ('MEMBER', 'GUEST');
create type public.workspace_role_permission as enum (
  'admin',
  'manage_workspace_roles',
  'manage_workspace_members'
);
create type public.blacklist_entry_type as enum ('email', 'domain');

create table public.workspaces (
  id uuid primary key,
  creator_id uuid not null,
  deleted boolean default false,
  personal boolean not null default false
);
create table public.workspace_members (
  ws_id uuid not null references public.workspaces(id),
  user_id uuid not null,
  type public.workspace_member_type not null default 'MEMBER',
  primary key (ws_id, user_id)
);
create table public.workspace_roles (
  id uuid primary key,
  ws_id uuid not null references public.workspaces(id)
);
create table public.workspace_role_members (
  role_id uuid not null references public.workspace_roles(id),
  user_id uuid not null
);
create table public.workspace_role_permissions (
  role_id uuid not null references public.workspace_roles(id),
  ws_id uuid not null,
  permission public.workspace_role_permission not null,
  enabled boolean not null default true
);
create table public.workspace_default_permissions (
  ws_id uuid not null,
  member_type public.workspace_member_type not null,
  permission public.workspace_role_permission not null,
  enabled boolean not null default true
);
create table public.email_blacklist (
  id uuid primary key default gen_random_uuid(),
  entry_type public.blacklist_entry_type not null,
  value text not null,
  reason text
);
-- Moved to private by 20260519232130_private_schema_cleanup.sql.
create table private.email_bounce_complaints (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  event_type text not null,
  bounce_type text,
  created_at timestamptz not null default now()
);

-- Supabase grants table access on public to service_role; auth stays closed.
grant select on all tables in schema public to service_role;
grant all on table private.email_bounce_complaints to service_role;
