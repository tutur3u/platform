-- Synthetic prerequisites for testing ONLY the Programming delta and the
-- unchanged existing enqueue RPC. Never apply to an ordinary database.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema private;
grant usage on schema private to anon, authenticated, service_role;
create table public.users(id uuid primary key);
create table public.workspaces(id uuid primary key);
create table public.workspace_members(ws_id uuid references public.workspaces on delete cascade, user_id uuid references public.users);
create table public.workspace_secrets(ws_id uuid references public.workspaces on delete cascade, name text, value text);
create table public.workspace_user_linked_users(ws_id uuid references public.workspaces on delete cascade, platform_user_id uuid references public.users, virtual_user_id uuid);
create table private.devbox_runners(id uuid primary key, status text, enabled_features jsonb, capabilities jsonb, last_heartbeat_at timestamptz);
create table private.devbox_leases(id uuid primary key, actor_id uuid, runner_id uuid, status text, keep boolean, expires_at timestamptz);
create table private.devbox_runs(id uuid primary key, actor_id uuid, lease_id uuid, runner_id uuid, status text, workload text, command text[], timeout_seconds integer);
create table private.learn_coding_submissions (
 id uuid primary key default gen_random_uuid(), ws_id uuid not null,
 user_id uuid not null references public.users(id) on delete cascade,
 challenge_slug text not null, source text not null,
 run_id uuid not null unique references private.devbox_runs(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table private.learn_coding_submissions enable row level security;
revoke all on private.learn_coding_submissions from public, anon, authenticated;
grant select, insert on private.learn_coding_submissions to service_role;
insert into public.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
insert into public.workspaces values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.workspace_members values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
insert into public.workspace_secrets values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ENABLE_EDUCATION','true');
insert into public.workspace_user_linked_users values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333');
-- Pre-migration legacy history, using no runner.
insert into private.devbox_runs(id) values ('44444444-4444-4444-8444-444444444444');
insert into private.learn_coding_submissions(id,ws_id,user_id,challenge_slug,source,run_id)
 values ('55555555-5555-4555-8555-555555555555','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','two-sum','synthetic legacy source','44444444-4444-4444-8444-444444444444');
