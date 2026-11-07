-- Synthetic minimal schema for the held periodic report regression.
-- Only the columns the real delivery functions read or write.
create schema if not exists private;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema private to service_role;

create table public.users (id uuid primary key);
create table public.workspaces (id uuid primary key, name text);
create table public.workspace_users (
  id uuid primary key,
  ws_id uuid not null references public.workspaces(id),
  email text
);
create table public.workspace_user_groups (
  id uuid primary key,
  ws_id uuid not null references public.workspaces(id)
);
create table public.workspace_configs (
  ws_id uuid not null references public.workspaces(id),
  id text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (ws_id, id)
);
create table private.external_user_monthly_reports (
  id uuid primary key,
  user_id uuid not null references public.workspace_users(id),
  group_id uuid not null references public.workspace_user_groups(id),
  title text not null,
  cadence text not null default 'monthly',
  period_start date,
  period_end date,
  generation_status text not null default 'ready',
  report_approval_status text not null default 'PENDING',
  approved_at timestamptz,
  delivery_status text not null default 'draft',
  delivery_requested_at timestamptz,
  delivered_at timestamptz,
  last_delivery_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
