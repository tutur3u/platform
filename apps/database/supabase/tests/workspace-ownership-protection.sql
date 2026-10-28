-- Workspace ownership (creator_id) and personal status are protected:
-- API roles change ownership only through transfer_workspace_ownership(),
-- personal status only as the workspace creator, and ordinary settings
-- updates keep working through the table-level UPDATE grant.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create temp table wop_users (label text primary key, id uuid not null);
insert into wop_users values
  ('creator', '38800000-0000-4000-8000-000000000001'),
  ('admin', '38800000-0000-4000-8000-000000000002'),
  ('member', '38800000-0000-4000-8000-000000000003'),
  ('outsider', '38800000-0000-4000-8000-000000000004');
grant select on wop_users to authenticated, service_role;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select id, 'wop-' || label || '@example.com', now(), '{}'::jsonb, '{}'::jsonb from wop_users;

create function pg_temp.uid(p_label text) returns uuid language sql stable as $$
  select id from wop_users where label = p_label
$$;

-- Runs one statement under an API role; returns its scalar result, 'ok',
-- or the SQLSTATE it raised.
create function pg_temp.as_role(p_user uuid, p_sql text, p_role text default 'authenticated')
returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin
    if p_sql ~* '^\s*select' then execute p_sql into r; else execute p_sql; end if;
    r := coalesce(nullif(r, ''), 'ok');
  exception when others then r := sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;

create function pg_temp.creator_of(p_ws uuid) returns uuid language sql stable as $$
  select creator_id from public.workspaces where id = p_ws
$$;

-- Fixtures (migration context, no JWT): a team workspace where admin and
-- member hold the admin permission, and a solo team workspace for the
-- creator's personal-status flip.
insert into public.workspaces (id, name, personal, creator_id) values
  ('38800000-0000-4000-8000-0000000000a1', 'WOP team', false, pg_temp.uid('creator')),
  ('38800000-0000-4000-8000-0000000000a2', 'WOP solo', false, pg_temp.uid('creator'));
insert into public.workspace_members (ws_id, user_id, type)
select '38800000-0000-4000-8000-0000000000a1', pg_temp.uid(label), 'MEMBER'
from wop_users where label in ('admin', 'member')
on conflict (ws_id, user_id) do update set type = 'MEMBER';
insert into public.workspace_default_permissions (ws_id, member_type, permission, enabled)
values ('38800000-0000-4000-8000-0000000000a1', 'MEMBER', 'admin', true)
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
select ok(has_workspace_permission('38800000-0000-4000-8000-0000000000a1',
  pg_temp.uid('admin'), 'manage_workspace_settings'),
  'fixture admin holds manage_workspace_settings');

-- Ordinary settings updates by an admin still work.
select is(pg_temp.as_role(pg_temp.uid('admin'), $q$
  update public.workspaces
  set name = 'WOP renamed', handle = 'wop-renamed-388', avatar_url = 'https://example.com/a.png'
  where id = '38800000-0000-4000-8000-0000000000a1'$q$), 'ok',
  'admin can update name, handle and avatar');
select is((select name || '|' || handle || '|' || avatar_url from public.workspaces
  where id = '38800000-0000-4000-8000-0000000000a1'),
  'WOP renamed|wop-renamed-388|https://example.com/a.png',
  'admin settings update is persisted');
select is(pg_temp.as_role(pg_temp.uid('admin'), $q$
  update public.workspaces set name = 'WOP team', creator_id = creator_id
  where id = '38800000-0000-4000-8000-0000000000a1'$q$), 'ok',
  'an update that resends the unchanged creator_id still works');

-- Direct creator_id changes are rejected for every API caller.
select is(pg_temp.as_role(pg_temp.uid('admin'), format(
  'update public.workspaces set creator_id = %L where id = %L',
  pg_temp.uid('admin'), '38800000-0000-4000-8000-0000000000a1')), '42501',
  'admin cannot set creator_id to themselves');
select is(pg_temp.as_role(pg_temp.uid('admin'), format(
  'update public.workspaces set creator_id = %L where id = %L',
  pg_temp.uid('member'), '38800000-0000-4000-8000-0000000000a1')), '42501',
  'admin cannot set creator_id to another member');
select is(pg_temp.as_role(pg_temp.uid('creator'), format(
  'update public.workspaces set creator_id = %L where id = %L',
  pg_temp.uid('member'), '38800000-0000-4000-8000-0000000000a1')), '42501',
  'creator cannot change creator_id with a direct update');
select set_config('tuturuuu.workspace_ownership_transfer',
  '38800000-0000-4000-8000-0000000000a1', true);
select is(pg_temp.as_role(pg_temp.uid('admin'), format(
  'update public.workspaces set creator_id = %L where id = %L',
  pg_temp.uid('admin'), '38800000-0000-4000-8000-0000000000a1')), '42501',
  'a transfer flag does not admit a direct API-role update');
select set_config('tuturuuu.workspace_ownership_transfer', '', true);
select is(pg_temp.creator_of('38800000-0000-4000-8000-0000000000a1'), pg_temp.uid('creator'),
  'creator_id is unchanged after rejected updates');

-- Personal status: only the creator may flip it.
select is(pg_temp.as_role(pg_temp.uid('admin'), $q$
  update public.workspaces set personal = true
  where id = '38800000-0000-4000-8000-0000000000a1'$q$), '42501',
  'non-creator admin cannot flip personal');
select is((select personal from public.workspaces where id = '38800000-0000-4000-8000-0000000000a1'),
  false, 'personal is unchanged after the rejected admin flip');
select is(pg_temp.as_role(pg_temp.uid('creator'), $q$
  update public.workspaces set personal = true
  where id = '38800000-0000-4000-8000-0000000000a2'$q$), 'ok',
  'creator can mark their solo workspace personal');
select is((select personal from public.workspaces where id = '38800000-0000-4000-8000-0000000000a2'),
  true, 'creator personal flip is persisted');
select is(pg_temp.as_role(pg_temp.uid('creator'), $q$
  update public.workspaces set name = 'WOP solo renamed'
  where id = '38800000-0000-4000-8000-0000000000a2'$q$), 'ok',
  'creator can still update settings on their personal workspace');

-- Workspace creation still records the caller as creator.
select is(pg_temp.as_role(pg_temp.uid('outsider'), $q$
  insert into public.workspaces (id, name)
  values ('38800000-0000-4000-8000-0000000000a3', 'WOP created')$q$), 'ok',
  'authenticated user can create a workspace');
select is(pg_temp.creator_of('38800000-0000-4000-8000-0000000000a3'), pg_temp.uid('outsider'),
  'workspace creation sets creator_id to the caller');

-- Transfer RPC.
select ok(not has_function_privilege('anon',
  'public.transfer_workspace_ownership(uuid,uuid)', 'EXECUTE'),
  'anon cannot execute the transfer RPC');
select ok(not has_table_privilege('authenticated', 'public.workspace_ownership_transfers', 'SELECT')
  and not has_table_privilege('authenticated', 'public.workspace_ownership_transfers', 'INSERT'),
  'authenticated cannot read or write the transfer audit log directly');
select is(pg_temp.as_role(pg_temp.uid('admin'), format(
  'select public.transfer_workspace_ownership(%L, %L)',
  '38800000-0000-4000-8000-0000000000a1', pg_temp.uid('admin'))), '42501',
  'non-creator admin cannot transfer ownership through the RPC');
select is(pg_temp.as_role(pg_temp.uid('creator'), format(
  'select public.transfer_workspace_ownership(%L, %L)',
  '38800000-0000-4000-8000-0000000000a1', pg_temp.uid('outsider'))), '22023',
  'ownership cannot be transferred to a non-member');
select is(pg_temp.as_role(pg_temp.uid('creator'), format(
  'select public.transfer_workspace_ownership(%L, %L)',
  '38800000-0000-4000-8000-0000000000a2', pg_temp.uid('member'))), '22023',
  'a personal workspace cannot be transferred');
select is((select count(*)::integer from public.workspace_ownership_transfers
  where ws_id in ('38800000-0000-4000-8000-0000000000a1', '38800000-0000-4000-8000-0000000000a2')),
  0, 'rejected transfers write no audit rows');
select is(pg_temp.as_role(pg_temp.uid('creator'), format(
  'select public.transfer_workspace_ownership(%L, %L)',
  '38800000-0000-4000-8000-0000000000a1', pg_temp.uid('member'))), 'ok',
  'creator can transfer ownership to a member through the RPC');
select is(pg_temp.creator_of('38800000-0000-4000-8000-0000000000a1'), pg_temp.uid('member'),
  'the RPC transfer updates creator_id');
select is((select count(*)::integer from public.workspace_ownership_transfers
  where ws_id = '38800000-0000-4000-8000-0000000000a1'
    and previous_creator_id = pg_temp.uid('creator')
    and new_creator_id = pg_temp.uid('member')
    and actor_id = pg_temp.uid('creator')), 1,
  'the RPC transfer writes one audit row');
select is(current_setting('tuturuuu.workspace_ownership_transfer', true), '',
  'the transfer flag is cleared after the RPC');
select is(pg_temp.as_role(pg_temp.uid('creator'), format(
  'select public.transfer_workspace_ownership(%L, %L)',
  '38800000-0000-4000-8000-0000000000a1', pg_temp.uid('creator'))), '42501',
  'the former creator can no longer transfer ownership');

-- service_role maintenance keeps working.
select is(pg_temp.as_role(null, format(
  'update public.workspaces set creator_id = %L where id = %L',
  pg_temp.uid('creator'), '38800000-0000-4000-8000-0000000000a1'), 'service_role'), 'ok',
  'service_role can change creator_id directly');
select is(pg_temp.creator_of('38800000-0000-4000-8000-0000000000a1'), pg_temp.uid('creator'),
  'service_role creator change is persisted');

select * from finish();
rollback;
