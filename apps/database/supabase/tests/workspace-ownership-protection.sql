-- Workspace ownership (creator_id) and personal status are protected:
-- API roles change ownership only through transfer_workspace_ownership(),
-- personal status only as the workspace creator (and only on a single-member
-- workspace), definer paths under a user JWT cannot change creator_id, every
-- creator_id change is audited, and ordinary settings updates keep working.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create temp table wop_users (label text primary key, id uuid not null);
insert into wop_users values
  ('creator', '38800000-0000-4000-8000-000000000001'),
  ('admin', '38800000-0000-4000-8000-000000000002'),
  ('member', '38800000-0000-4000-8000-000000000003'),
  ('outsider', '38800000-0000-4000-8000-000000000004'),
  ('joiner', '38800000-0000-4000-8000-000000000005');
grant select on wop_users to authenticated, service_role;

create temp table wop_ws (label text primary key, id uuid not null);
insert into wop_ws values
  ('team', '38800000-0000-4000-8000-0000000000a1'),
  ('solo', '38800000-0000-4000-8000-0000000000a2'),
  ('created', '38800000-0000-4000-8000-0000000000a3'),
  ('creatorless', '38800000-0000-4000-8000-0000000000a4'),
  ('fk', '38800000-0000-4000-8000-0000000000a5'),
  ('definer', '38800000-0000-4000-8000-0000000000a6'),
  ('deleted', '38800000-0000-4000-8000-0000000000a8'),
  ('audit', '38800000-0000-4000-8000-0000000000a9'),
  ('root', '00000000-0000-0000-0000-000000000000');

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select id, 'wop-' || label || '@example.com', now(), '{}'::jsonb, '{}'::jsonb from wop_users;

create function pg_temp.uid(p_label text) returns uuid language sql stable as $$
  select id from wop_users where label = p_label
$$;
create function pg_temp.w(p_label text) returns uuid language sql stable as $$
  select id from wop_ws where label = p_label
$$;

-- Runs one statement under an API role; returns its scalar result, 'ok',
-- or the SQLSTATE it raised (the message is kept in wop.last_error).
create function pg_temp.as_role(p_user uuid, p_sql text, p_role text default 'authenticated')
returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  perform set_config('wop.last_error', '', true);
  begin
    if p_sql ~* '^\s*select' then execute p_sql into r; else execute p_sql; end if;
    r := coalesce(nullif(r, ''), 'ok');
  exception when others then
    r := sqlstate;
    perform set_config('wop.last_error', sqlerrm, true);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;

-- As as_role, but a rejected statement returns 'SQLSTATE: message'.
create function pg_temp.as_err(p_user uuid, p_sql text, p_role text default 'authenticated')
returns text language plpgsql as $$
declare r text := pg_temp.as_role(p_user, p_sql, p_role);
begin
  if coalesce(current_setting('wop.last_error', true), '') <> '' then
    return r || ': ' || current_setting('wop.last_error', true);
  end if;
  return r;
end $$;

create function pg_temp.creator_of(p_ws uuid) returns uuid language sql stable as $$
  select creator_id from public.workspaces where id = p_ws
$$;

-- True when a function body updates workspaces.creator_id or personal:
-- UPDATE (with or without schema, quotes, ONLY or an alias), INSERT ... ON
-- CONFLICT DO UPDATE, or dynamic SQL (an EXECUTE statement that names an
-- update and a protected column) in a body that mentions workspaces.
create function pg_temp.writes_protected_columns(p_src text) returns boolean
language sql immutable as $$
  select p_src ~* 'update\s+(only\s+)?(public\.)?"?workspaces"?(\s+(as\s+)?(?!set\y)"?[a-z_][a-z0-9_]*"?)?\s+set\s+((?!\ywhere\y)[^;])*?\y(creator_id|personal)\y\s*='
    or p_src ~* 'insert\s+into\s+(public\.)?"?workspaces"?[^;]*?\yon\s+conflict\y[^;]*?\ydo\s+update\s+set\y((?!\ywhere\y)[^;])*?\y(creator_id|personal)\y\s*='
    or (p_src ~* '\yworkspaces\y'
      and p_src ~* '\yexecute\y[^;]*?\y(update|on\s+conflict)\y[^;]*?\y(creator_id|personal)\y')
$$;

-- Fixtures (migration context, no JWT): a team workspace with an admin, a
-- member and a guest, a solo team workspace, and a deleted workspace.
insert into public.workspaces (id, name, personal, creator_id) values
  (pg_temp.w('team'), 'WOP team', false, pg_temp.uid('creator')),
  (pg_temp.w('solo'), 'WOP solo', false, pg_temp.uid('creator'));
insert into public.workspaces (id, name, personal, creator_id, deleted)
values (pg_temp.w('deleted'), 'WOP deleted', false, pg_temp.uid('creator'), true);
insert into public.workspace_members (ws_id, user_id, type)
select pg_temp.w('team'), pg_temp.uid(label), 'MEMBER'
from wop_users where label in ('admin', 'member')
on conflict (ws_id, user_id) do update set type = 'MEMBER';
insert into public.workspace_members (ws_id, user_id, type)
values (pg_temp.w('team'), pg_temp.uid('joiner'), 'GUEST')
on conflict (ws_id, user_id) do update set type = 'GUEST';
insert into public.workspace_members (ws_id, user_id, type)
values (pg_temp.w('deleted'), pg_temp.uid('member'), 'MEMBER')
on conflict (ws_id, user_id) do update set type = 'MEMBER';
insert into public.workspace_default_permissions (ws_id, member_type, permission, enabled)
values (pg_temp.w('team'), 'MEMBER', 'admin', true)
on conflict do nothing;
-- The route only lets a creator without another personal workspace flip one.
update public.workspaces set personal = false
where creator_id = pg_temp.uid('creator') and personal is true;

select ok(has_table_privilege('authenticated', 'public.workspaces', 'UPDATE'),
  'authenticated keeps table-level UPDATE on workspaces');
select ok(exists(select 1 from pg_trigger
  where tgrelid = 'public.workspaces'::regclass
    and tgname = 'workspaces_guard_protected_columns' and not tgisinternal),
  'protected-column guard trigger is installed');
select ok(exists(select 1 from pg_trigger
  where tgrelid = 'public.workspaces'::regclass
    and tgname = 'workspaces_audit_creator_change' and not tgisinternal),
  'creator_id audit trigger is installed');
select ok(not exists(select 1 from pg_constraint
  where conrelid = 'public.workspace_ownership_transfers'::regclass and contype = 'f'),
  'audit rows have no foreign key, so they outlive the workspace');
select ok(has_workspace_permission(pg_temp.w('team'),
  pg_temp.uid('admin'), 'manage_workspace_settings'),
  'fixture admin holds manage_workspace_settings');

-- Ordinary settings updates by an admin still work.
select is(pg_temp.as_err(pg_temp.uid('admin'), format($q$
  update public.workspaces
  set name = 'WOP renamed', handle = 'wop-renamed-388', avatar_url = 'https://example.com/a.png'
  where id = %L$q$, pg_temp.w('team'))), 'ok',
  'admin can update name, handle and avatar');
select is((select name || '|' || handle || '|' || avatar_url from public.workspaces
  where id = pg_temp.w('team')),
  'WOP renamed|wop-renamed-388|https://example.com/a.png',
  'admin settings update is persisted');
select is(pg_temp.as_err(pg_temp.uid('admin'), format($q$
  update public.workspaces set name = 'WOP team', creator_id = creator_id
  where id = %L$q$, pg_temp.w('team'))), 'ok',
  'an update that resends the unchanged creator_id still works');

-- Direct creator_id changes are rejected for every API caller.
select is(pg_temp.as_err(pg_temp.uid('admin'), format(
  'update public.workspaces set creator_id = %L where id = %L',
  pg_temp.uid('admin'), pg_temp.w('team'))),
  '42501: Workspace ownership can only change through an ownership transfer',
  'admin cannot set creator_id to themselves');
select is(pg_temp.as_err(pg_temp.uid('admin'), format(
  'update public.workspaces set creator_id = %L where id = %L',
  pg_temp.uid('member'), pg_temp.w('team'))),
  '42501: Workspace ownership can only change through an ownership transfer',
  'admin cannot set creator_id to another member');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'update public.workspaces set creator_id = %L where id = %L',
  pg_temp.uid('member'), pg_temp.w('team'))),
  '42501: Workspace ownership can only change through an ownership transfer',
  'creator cannot change creator_id with a direct update');
-- The transfer flag is read only for non-API roles: an API caller who sets it
-- is still rejected.
select is(pg_temp.as_err(pg_temp.uid('admin'), format(
  $q$select set_config('tuturuuu.workspace_ownership_transfer', %L, true)$q$,
  pg_temp.w('team'))), pg_temp.w('team')::text,
  'an API caller can set the transfer flag');
select is(pg_temp.as_err(pg_temp.uid('admin'), format(
  'update public.workspaces set creator_id = %L where id = %L',
  pg_temp.uid('admin'), pg_temp.w('team'))),
  '42501: Workspace ownership can only change through an ownership transfer',
  'a caller-set transfer flag does not admit an API-role update');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'update public.workspaces set creator_id = %L where id = %L',
  pg_temp.uid('member'), pg_temp.w('team'))),
  '42501: Workspace ownership can only change through an ownership transfer',
  'the creator is rejected with the flag set too');
select set_config('tuturuuu.workspace_ownership_transfer', '', true);
select is(pg_temp.creator_of(pg_temp.w('team')), pg_temp.uid('creator'),
  'creator_id is unchanged after rejected updates');
select is((select count(*)::integer from public.workspace_ownership_transfers
  where ws_id = pg_temp.w('team')), 0, 'rejected updates write no audit rows');

-- INSERT ... ON CONFLICT DO UPDATE reaches the same BEFORE UPDATE guard.
select is(pg_temp.as_err(pg_temp.uid('admin'), format(
  $q$insert into public.workspaces (id, name, creator_id) values (%L, 'WOP upsert', %L)
  on conflict (id) do update set creator_id = excluded.creator_id$q$,
  pg_temp.w('team'), pg_temp.uid('admin'))),
  '42501: Workspace ownership can only change through an ownership transfer',
  'admin cannot take ownership through an upsert');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  $q$insert into public.workspaces (id, name, creator_id) values (%L, 'WOP upsert', %L)
  on conflict (id) do update set creator_id = excluded.creator_id$q$,
  pg_temp.w('team'), pg_temp.uid('creator'))), 'ok',
  'an upsert that keeps the creator_id is a no-op for the creator');
select is(pg_temp.as_err(pg_temp.uid('admin'), format(
  $q$insert into public.workspaces (id, name, creator_id) values (%L, 'WOP upsert', %L)
  on conflict (id) do update set personal = true$q$,
  pg_temp.w('team'), pg_temp.uid('admin'))),
  '42501: Only the workspace creator can change personal status',
  'a non-creator cannot flip personal through an upsert');
select is(pg_temp.creator_of(pg_temp.w('team')), pg_temp.uid('creator'),
  'creator_id is unchanged after the upsert attempts');

-- Anonymous callers: under the current policies the statement matches no
-- row; with the grant and row-level security forced open (to prove the guard
-- itself) it is rejected by the trigger.
select is(pg_temp.as_err(null, format(
  'update public.workspaces set creator_id = %L where id = %L',
  pg_temp.uid('admin'), pg_temp.w('team')), 'anon'), 'ok',
  'an anon update matches no row under the current policies');
select is(pg_temp.creator_of(pg_temp.w('team')), pg_temp.uid('creator'),
  'creator_id is unchanged after the anon update that matched no row');
grant update on public.workspaces to anon;
alter table public.workspaces disable row level security;
select is(pg_temp.as_err(null, format(
  'update public.workspaces set creator_id = %L where id = %L',
  pg_temp.uid('admin'), pg_temp.w('team')), 'anon'),
  '42501: Workspace ownership can only change through an ownership transfer',
  'anon cannot change creator_id even when row-level security admits it');
select is(pg_temp.as_err(null, format(
  'update public.workspaces set personal = true where id = %L',
  pg_temp.w('team')), 'anon'),
  '42501: Only the workspace creator can change personal status',
  'anon cannot change personal even when row-level security admits it');
alter table public.workspaces enable row level security;
select is(pg_temp.creator_of(pg_temp.w('team')), pg_temp.uid('creator'),
  'creator_id is unchanged after the anon attempts');

-- Personal status: only the creator may flip it, and only on one member.
select is(pg_temp.as_err(pg_temp.uid('admin'), format(
  'update public.workspaces set personal = true where id = %L', pg_temp.w('team'))),
  '42501: Only the workspace creator can change personal status',
  'non-creator admin cannot flip personal');
select is((select personal from public.workspaces where id = pg_temp.w('team')),
  false, 'personal is unchanged after the rejected admin flip');
-- A non-creator cannot turn personal off either.
update public.workspaces set personal = true where id = pg_temp.w('team');
select is(pg_temp.as_err(pg_temp.uid('admin'), format(
  'update public.workspaces set personal = false where id = %L', pg_temp.w('team'))),
  '42501: Only the workspace creator can change personal status',
  'non-creator admin cannot turn personal off');
update public.workspaces set personal = false where id = pg_temp.w('team');
select is((select count(*)::integer from public.workspace_members
  where ws_id = pg_temp.w('team')), 4, 'the team workspace has several members');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'update public.workspaces set personal = true where id = %L', pg_temp.w('team'))),
  '22023: A personal workspace must have exactly one member',
  'the creator cannot mark a multi-member workspace personal');
select is((select personal from public.workspaces where id = pg_temp.w('team')),
  false, 'personal is unchanged after the rejected multi-member flip');
select is((select count(*)::integer from public.workspace_members
  where ws_id = pg_temp.w('solo')), 1, 'the solo workspace has exactly one member');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'update public.workspaces set personal = true where id = %L', pg_temp.w('solo'))), 'ok',
  'creator can mark their solo workspace personal');
select is((select personal from public.workspaces where id = pg_temp.w('solo')),
  true, 'creator personal flip is persisted');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'update public.workspaces set name = %L where id = %L', 'WOP solo renamed', pg_temp.w('solo'))), 'ok',
  'creator can still update settings on their personal workspace');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'update public.workspaces set personal = false where id = %L', pg_temp.w('solo'))), 'ok',
  'creator can turn personal off again');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'update public.workspaces set personal = true where id = %L', pg_temp.w('solo'))), 'ok',
  'creator can mark the solo workspace personal again');
-- A second member blocks the flip for the creator; service_role still bypasses.
update public.workspaces set personal = false where id = pg_temp.w('solo');
insert into public.workspace_members (ws_id, user_id, type)
values (pg_temp.w('solo'), pg_temp.uid('member'), 'MEMBER');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'update public.workspaces set personal = true where id = %L', pg_temp.w('solo'))),
  '22023: A personal workspace must have exactly one member',
  'the creator cannot mark a workspace with two members personal');
select is(pg_temp.as_err(null, format(
  'update public.workspaces set personal = true where id = %L', pg_temp.w('solo')),
  'service_role'), 'ok',
  'service_role can still set personal on a multi-member workspace');
delete from public.workspace_members
where ws_id = pg_temp.w('solo') and user_id = pg_temp.uid('member');

-- Workspace creation still records the caller as creator.
select is(pg_temp.as_err(pg_temp.uid('outsider'), format(
  $q$insert into public.workspaces (id, name) values (%L, 'WOP created')$q$,
  pg_temp.w('created'))), 'ok',
  'authenticated user can create a workspace');
select is(pg_temp.creator_of(pg_temp.w('created')), pg_temp.uid('outsider'),
  'workspace creation sets creator_id to the caller');

-- Transfer RPC.
select ok(not has_function_privilege('anon',
  'public.transfer_workspace_ownership(uuid,uuid)', 'EXECUTE'),
  'anon cannot execute the transfer RPC');
select ok(not has_function_privilege('service_role',
  'public.transfer_workspace_ownership(uuid,uuid)', 'EXECUTE'),
  'service_role cannot execute the transfer RPC (it has no end user)');
select ok(has_function_privilege('authenticated',
  'public.transfer_workspace_ownership(uuid,uuid)', 'EXECUTE'),
  'authenticated can execute the transfer RPC');
select ok(not has_table_privilege('authenticated', 'public.workspace_ownership_transfers', 'SELECT')
  and not has_table_privilege('authenticated', 'public.workspace_ownership_transfers', 'INSERT'),
  'authenticated cannot read or write the transfer audit log directly');
select is(pg_temp.as_err(null, format(
  'select public.transfer_workspace_ownership(%L, %L)',
  pg_temp.w('team'), pg_temp.uid('member')), 'service_role'),
  '42501: permission denied for function transfer_workspace_ownership',
  'service_role is refused by the privilege check');
select is(pg_temp.as_err(pg_temp.uid('admin'), format(
  'select public.transfer_workspace_ownership(%L, %L)',
  pg_temp.w('team'), pg_temp.uid('admin'))),
  '42501: Only the workspace creator can transfer ownership',
  'non-creator admin cannot transfer ownership through the RPC');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'select public.transfer_workspace_ownership(%L, %L)',
  pg_temp.w('team'), pg_temp.uid('outsider'))),
  '22023: New owner must be a workspace member',
  'ownership cannot be transferred to a non-member');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'select public.transfer_workspace_ownership(%L, %L)',
  pg_temp.w('team'), pg_temp.uid('joiner'))),
  '22023: New owner must be a workspace member',
  'ownership cannot be transferred to a guest member');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'select public.transfer_workspace_ownership(%L, %L)',
  pg_temp.w('team'), pg_temp.uid('creator'))),
  '22023: New owner must differ from the current owner',
  'ownership cannot be transferred to the current creator');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'select public.transfer_workspace_ownership(%L, null)', pg_temp.w('team'))),
  '22023: Workspace and new owner are required',
  'a transfer requires a new owner');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'select public.transfer_workspace_ownership(null, %L)', pg_temp.uid('member'))),
  '22023: Workspace and new owner are required',
  'a transfer requires a workspace');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'select public.transfer_workspace_ownership(%L, %L)',
  pg_temp.w('solo'), pg_temp.uid('member'))),
  '22023: This workspace cannot be transferred',
  'a personal workspace cannot be transferred');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'select public.transfer_workspace_ownership(%L, %L)',
  pg_temp.w('deleted'), pg_temp.uid('member'))),
  '42501: Only the workspace creator can transfer ownership',
  'a deleted workspace cannot be transferred');
insert into public.workspaces (id, name, personal, creator_id)
values (pg_temp.w('root'), 'WOP root', false, pg_temp.uid('creator'))
on conflict (id) do update set creator_id = excluded.creator_id;
insert into public.workspace_members (ws_id, user_id, type)
values (pg_temp.w('root'), pg_temp.uid('member'), 'MEMBER')
on conflict (ws_id, user_id) do update set type = 'MEMBER';
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'select public.transfer_workspace_ownership(%L, %L)',
  pg_temp.w('root'), pg_temp.uid('member'))),
  '22023: This workspace cannot be transferred',
  'the root workspace cannot be transferred even by its recorded creator');
select is((select count(*)::integer from public.workspace_ownership_transfers
  where source = 'transfer_rpc'
    and ws_id in (pg_temp.w('team'), pg_temp.w('solo'), pg_temp.w('deleted'), pg_temp.w('root'))),
  0, 'rejected transfers write no audit rows');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'select public.transfer_workspace_ownership(%L, %L)',
  pg_temp.w('team'), pg_temp.uid('member'))), 'ok',
  'creator can transfer ownership to a member through the RPC');
select is(pg_temp.creator_of(pg_temp.w('team')), pg_temp.uid('member'),
  'the RPC transfer updates creator_id');
select is(coalesce(current_setting('tuturuuu.workspace_ownership_transfer', true), ''), '',
  'the RPC clears the transfer flag after its update');
select is((select count(*)::integer from public.workspace_ownership_transfers
  where ws_id = pg_temp.w('team')
    and previous_creator_id = pg_temp.uid('creator')
    and new_creator_id = pg_temp.uid('member')
    and actor_id = pg_temp.uid('creator')
    and actor_role = 'authenticated'
    and source = 'transfer_rpc'), 1,
  'the RPC transfer writes exactly one audit row through the trigger');
select is(pg_temp.as_err(pg_temp.uid('creator'), format(
  'select public.transfer_workspace_ownership(%L, %L)',
  pg_temp.w('team'), pg_temp.uid('creator'))),
  '42501: Only the workspace creator can transfer ownership',
  'the former creator can no longer transfer ownership');

-- service_role maintenance keeps working and is audited as a direct change.
select is(pg_temp.as_err(null, format(
  'update public.workspaces set creator_id = %L where id = %L',
  pg_temp.uid('creator'), pg_temp.w('team')), 'service_role'), 'ok',
  'service_role can change creator_id directly');
select is(pg_temp.creator_of(pg_temp.w('team')), pg_temp.uid('creator'),
  'service_role creator change is persisted');
select is((select count(*)::integer from public.workspace_ownership_transfers
  where ws_id = pg_temp.w('team') and previous_creator_id = pg_temp.uid('member')
    and new_creator_id = pg_temp.uid('creator') and actor_id is null
    and actor_role = 'service_role' and source = 'direct'), 1,
  'a service_role creator change is audited as a direct change');
-- Migration and admin SQL (no end-user identity) keep working and are audited.
update public.workspaces set creator_id = pg_temp.uid('member') where id = pg_temp.w('team');
select is(pg_temp.creator_of(pg_temp.w('team')), pg_temp.uid('member'),
  'a migration-context creator change is persisted');
select is((select count(*)::integer from public.workspace_ownership_transfers
  where ws_id = pg_temp.w('team') and new_creator_id = pg_temp.uid('member')
    and actor_role = 'database' and source = 'direct'), 1,
  'a migration-context creator change is audited as a database change');
update public.workspaces set creator_id = pg_temp.uid('creator') where id = pg_temp.w('team');

-- Audit rows outlive the workspace.
insert into public.workspaces (id, name, personal, creator_id)
values (pg_temp.w('audit'), 'WOP audit', false, pg_temp.uid('creator'));
update public.workspaces set creator_id = pg_temp.uid('member') where id = pg_temp.w('audit');
delete from public.workspaces where id = pg_temp.w('audit');
select is((select count(*)::integer from public.workspace_ownership_transfers
  where ws_id = pg_temp.w('audit') and new_creator_id = pg_temp.uid('member')), 1,
  'the audit row survives deleting the workspace');

-- Writer inventory: only the transfer RPC writes creator_id or personal in
-- SQL, across every non-system schema. The former membership-insert claim
-- path stays removed. The detector must see aliased, quoted, ONLY, upsert and
-- dynamic forms, and ignore unrelated statements.
select ok(to_regprocedure('public.claim_workspace_creator_when_missing()') is null,
  'the removed membership-insert creator claim path is still absent');
select ok(pg_temp.writes_protected_columns('update public.workspaces set creator_id = x where id = y'),
  'the writer detector matches an unaliased update');
select ok(pg_temp.writes_protected_columns('UPDATE public.workspaces w SET creator_id = x WHERE w.id = y'),
  'the writer detector matches an aliased update');
select ok(pg_temp.writes_protected_columns('update public.workspaces as w set name = 1, personal = true'),
  'the writer detector matches an AS alias with personal in a later assignment');
select ok(pg_temp.writes_protected_columns('update only "workspaces" ws set creator_id = x'),
  'the writer detector matches ONLY and quoted names');
select ok(pg_temp.writes_protected_columns(
  'insert into public.workspaces (id) values (1) on conflict (id) do update set creator_id = excluded.creator_id'),
  'the writer detector matches an upsert that sets creator_id');
select ok(pg_temp.writes_protected_columns(
  $s$execute format('update %s set creator_id = $1', 'public.workspaces')$s$),
  'the writer detector matches dynamic SQL that mentions workspaces and creator_id');
select ok(not pg_temp.writes_protected_columns(
  $s$execute format('select personal from public.%I where id = $1', 'workspaces')$s$),
  'the writer detector ignores dynamic SELECTs that mention workspaces and personal');
select ok(not pg_temp.writes_protected_columns('update public.workspaces w set name = 1 where w.creator_id = x'),
  'the writer detector ignores a creator_id predicate in WHERE');
select ok(not pg_temp.writes_protected_columns('update public.workspace_members m set creator_id = x'),
  'the writer detector ignores other tables');
select ok(not pg_temp.writes_protected_columns(
  'insert into public.workspaces (id) values (1) on conflict (id) do update set name = excluded.name'),
  'the writer detector ignores an upsert that only sets name');
select is((select coalesce(array_agg(n.nspname || '.' || p.proname order by 1), '{}')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
    and pg_temp.writes_protected_columns(p.prosrc)),
  array['public.transfer_workspace_ownership']::text[],
  'only the transfer RPC writes workspaces.creator_id or personal');

-- Definer paths under a user JWT: probe functions are created after the
-- inventory so they cannot affect it.
create schema wop_probe;
grant usage on schema wop_probe to authenticated;
create function wop_probe.set_creator(p_flag text, p_ws uuid, p_new uuid) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if p_flag is not null then
    perform set_config('tuturuuu.workspace_ownership_transfer', p_flag, true);
  end if;
  update public.workspaces set creator_id = p_new where id = p_ws;
  perform set_config('tuturuuu.workspace_ownership_transfer', '', true);
end $$;
grant execute on function wop_probe.set_creator(text, uuid, uuid) to authenticated;
select is(pg_temp.as_err(pg_temp.uid('admin'), format(
  'select wop_probe.set_creator(null, %L, %L)', pg_temp.w('team'), pg_temp.uid('admin'))),
  '42501: Workspace ownership can only change through an ownership transfer',
  'a definer function under a user JWT cannot change creator_id');
select is(pg_temp.as_err(pg_temp.uid('admin'), format(
  'select wop_probe.set_creator(%L, %L, %L)',
  pg_temp.w('solo'), pg_temp.w('team'), pg_temp.uid('admin'))),
  '42501: Workspace ownership can only change through an ownership transfer',
  'a transfer flag scoped to another workspace does not admit the change');
select is(pg_temp.creator_of(pg_temp.w('team')), pg_temp.uid('creator'),
  'creator_id is unchanged after the rejected definer changes');
select is(pg_temp.as_err(pg_temp.uid('admin'), format(
  'select wop_probe.set_creator(%L, %L, %L)',
  pg_temp.w('team'), pg_temp.w('team'), pg_temp.uid('member'))), 'ok',
  'a definer function holding the flag for this workspace may change creator_id');
select is(pg_temp.creator_of(pg_temp.w('team')), pg_temp.uid('member'),
  'the flag-scoped definer change is persisted');
update public.workspaces set creator_id = pg_temp.uid('creator') where id = pg_temp.w('team');

-- Invite acceptance into a workspace whose creator is not a member: the
-- joiner becomes the sole member and ownership does not move.
insert into public.workspaces (id, name, personal, creator_id) values
  (pg_temp.w('creatorless'), 'WOP creatorless', false, pg_temp.uid('creator'));
delete from public.workspace_members where ws_id = pg_temp.w('creatorless');
insert into public.workspace_invites (ws_id, user_id, type)
values (pg_temp.w('creatorless'), pg_temp.uid('joiner'), 'MEMBER');
select is(pg_temp.as_err(pg_temp.uid('joiner'), format(
  $q$insert into public.workspace_members (ws_id, user_id, type) values (%L, %L, 'MEMBER')$q$,
  pg_temp.w('creatorless'), pg_temp.uid('joiner'))), 'ok',
  'invited user can accept into a workspace whose creator is not a member');
select is((select array_agg(user_id) from public.workspace_members
  where ws_id = pg_temp.w('creatorless')), array[pg_temp.uid('joiner')],
  'the joiner is the sole member after accepting');
select ok(not exists(select 1 from public.workspace_invites
  where ws_id = pg_temp.w('creatorless') and user_id = pg_temp.uid('joiner')),
  'the accepted invite is consumed');
select is(pg_temp.creator_of(pg_temp.w('creatorless')), pg_temp.uid('creator'),
  'joining does not change creator_id');

-- A definer trigger that claims creator_id on membership insert (the removed
-- claim path) is now rejected under the joiner's JWT, and the insert rolls
-- back with it.
create function wop_probe.definer_claim() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  update public.workspaces w set creator_id = new.user_id
  where w.id = new.ws_id and w.creator_id <> new.user_id
    and not exists (select 1 from public.workspace_members m
      where m.ws_id = new.ws_id and m.user_id <> new.user_id);
  return new;
end $$;
insert into public.workspaces (id, name, personal, creator_id) values
  (pg_temp.w('definer'), 'WOP definer claim', false, pg_temp.uid('creator'));
delete from public.workspace_members where ws_id = pg_temp.w('definer');
create trigger wop_definer_claim_tr after insert on public.workspace_members
for each row when (new.ws_id = '38800000-0000-4000-8000-0000000000a6')
execute function wop_probe.definer_claim();
insert into public.workspace_invites (ws_id, user_id, type)
values (pg_temp.w('definer'), pg_temp.uid('joiner'), 'MEMBER');
select is(pg_temp.as_err(pg_temp.uid('joiner'), format(
  $q$insert into public.workspace_members (ws_id, user_id, type) values (%L, %L, 'MEMBER')$q$,
  pg_temp.w('definer'), pg_temp.uid('joiner'))),
  '42501: Workspace ownership can only change through an ownership transfer',
  'a definer claim trigger cannot change creator_id under the joiner JWT');
select is(pg_temp.creator_of(pg_temp.w('definer')), pg_temp.uid('creator'),
  'creator_id is unchanged after the rejected definer claim');
select ok(not exists(select 1 from public.workspace_members
  where ws_id = pg_temp.w('definer')), 'the rejected claim rolls the membership insert back');
select is(pg_temp.as_err(null, format(
  $q$insert into public.workspace_members (ws_id, user_id, type) values (%L, %L, 'MEMBER')$q$,
  pg_temp.w('definer'), pg_temp.uid('joiner')), 'service_role'), 'ok',
  'the same definer trigger works under service_role');
select is(pg_temp.creator_of(pg_temp.w('definer')), pg_temp.uid('joiner'),
  'the definer path changes creator_id without an end-user identity');
drop trigger wop_definer_claim_tr on public.workspace_members;

-- workspaces_creator_id_fkey ON UPDATE CASCADE still follows a user-id change.
insert into public.users (id, display_name) values ('38800000-0000-4000-8000-0000000000f1', 'WOP fk');
insert into public.workspaces (id, name, personal, creator_id) values
  (pg_temp.w('fk'), 'WOP fk team', false, '38800000-0000-4000-8000-0000000000f1');
delete from public.workspace_members where user_id = '38800000-0000-4000-8000-0000000000f1';
select is(pg_temp.as_err('38800000-0000-4000-8000-0000000000f1',
  $q$update public.users set id = '38800000-0000-4000-8000-0000000000f2'
  where id = '38800000-0000-4000-8000-0000000000f1'$q$), 'ok',
  'a self users.id change matches no row under the user JWT');
select ok(exists(select 1 from public.users where id = '38800000-0000-4000-8000-0000000000f1'),
  'a user cannot change their own users.id');
select is(pg_temp.creator_of(pg_temp.w('fk')),
  '38800000-0000-4000-8000-0000000000f1'::uuid, 'creator_id is unchanged after the rejected self change');
select is(pg_temp.as_err(null,
  $q$update public.users set id = '38800000-0000-4000-8000-0000000000f2'
  where id = '38800000-0000-4000-8000-0000000000f1'$q$, 'service_role'), 'ok',
  'service_role user-id change succeeds');
select is(pg_temp.creator_of(pg_temp.w('fk')),
  '38800000-0000-4000-8000-0000000000f2'::uuid,
  'the FK cascade moves creator_id under service_role');
delete from public.workspace_members where user_id = '38800000-0000-4000-8000-0000000000f2';
update public.users set id = '38800000-0000-4000-8000-0000000000f3'
where id = '38800000-0000-4000-8000-0000000000f2';
select is(pg_temp.creator_of(pg_temp.w('fk')),
  '38800000-0000-4000-8000-0000000000f3'::uuid,
  'the FK cascade moves creator_id in a migration context');
-- The cascade also succeeds when the user-id change runs on a definer path
-- under an authenticated JWT: the old creator id no longer exists in
-- public.users and the new one does.
delete from public.workspace_members where user_id = '38800000-0000-4000-8000-0000000000f3';
select set_config('request.jwt.claims', json_build_object('sub',
  pg_temp.uid('outsider'), 'role', 'authenticated')::text, true);
update public.users set id = '38800000-0000-4000-8000-0000000000f4'
where id = '38800000-0000-4000-8000-0000000000f3';
select set_config('request.jwt.claims', '', true);
select is(pg_temp.creator_of(pg_temp.w('fk')),
  '38800000-0000-4000-8000-0000000000f4'::uuid,
  'the FK cascade moves creator_id on a definer path under an authenticated JWT');
select is((select count(*)::integer from public.workspace_ownership_transfers
  where ws_id = pg_temp.w('fk') and source = 'direct'), 3,
  'each FK cascade is audited as a direct change');

select * from finish();
rollback;
