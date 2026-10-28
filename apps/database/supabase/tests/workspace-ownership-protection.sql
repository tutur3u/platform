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
  ('outsider', '38800000-0000-4000-8000-000000000004'),
  ('joiner', '38800000-0000-4000-8000-000000000005');
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
  'a session setting does not admit a direct API-role update');
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

-- Writer inventory: only the transfer RPC updates creator_id or personal in
-- SQL. The former membership-insert claim path stays removed.
select ok(to_regprocedure('public.claim_workspace_creator_when_missing()') is null,
  'the removed membership-insert creator claim path is still absent');
select is((select coalesce(array_agg(n.nspname || '.' || p.proname order by 1), '{}')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.prosrc ~* 'update\s+(public\.)?"?workspaces"?\y\s+set\s+((?!\ywhere\y)[^;])*?\y(creator_id|personal)\y\s*='),
  array['public.transfer_workspace_ownership']::text[],
  'only the transfer RPC updates workspaces.creator_id or personal');

-- No caller-set session setting admits a direct API-role update.
select is(pg_temp.as_role(pg_temp.uid('creator'), format(
  $q$select set_config('tuturuuu.workspace_ownership_transfer', %L, true)$q$,
  '38800000-0000-4000-8000-0000000000a1')), '38800000-0000-4000-8000-0000000000a1',
  'an API caller can set a session setting');
select is(current_setting('tuturuuu.workspace_ownership_transfer', true),
  '38800000-0000-4000-8000-0000000000a1', 'the caller-set setting is still active');
select is(pg_temp.as_role(pg_temp.uid('creator'), format(
  'update public.workspaces set creator_id = %L where id = %L',
  pg_temp.uid('creator'), '38800000-0000-4000-8000-0000000000a1')), 'ok',
  'resending the current creator_id under the setting is a no-op');
select is(pg_temp.as_role(pg_temp.uid('creator'), format(
  'update public.workspaces set creator_id = %L where id = %L',
  pg_temp.uid('member'), '38800000-0000-4000-8000-0000000000a1')), '42501',
  'creator cannot change creator_id directly even with a self-set setting');
select is(pg_temp.as_role(pg_temp.uid('admin'), format(
  'update public.workspaces set creator_id = %L where id = %L',
  pg_temp.uid('admin'), '38800000-0000-4000-8000-0000000000a1')), '42501',
  'admin cannot take ownership directly even with a self-set setting');
select set_config('tuturuuu.workspace_ownership_transfer', '', true);
select is(pg_temp.creator_of('38800000-0000-4000-8000-0000000000a1'), pg_temp.uid('creator'),
  'creator_id is unchanged after setting-spoofing attempts');

-- Invite acceptance into a workspace whose creator is not a member: the
-- joiner becomes the sole member and ownership does not move.
insert into public.workspaces (id, name, personal, creator_id) values
  ('38800000-0000-4000-8000-0000000000a4', 'WOP creatorless', false, pg_temp.uid('creator'));
delete from public.workspace_members where ws_id = '38800000-0000-4000-8000-0000000000a4';
insert into public.workspace_invites (ws_id, user_id, type)
values ('38800000-0000-4000-8000-0000000000a4', pg_temp.uid('joiner'), 'MEMBER');
select is(pg_temp.as_role(pg_temp.uid('joiner'), format(
  $q$insert into public.workspace_members (ws_id, user_id, type) values (%L, %L, 'MEMBER')$q$,
  '38800000-0000-4000-8000-0000000000a4', pg_temp.uid('joiner'))), 'ok',
  'invited user can accept into a workspace whose creator is not a member');
select is((select array_agg(user_id) from public.workspace_members
  where ws_id = '38800000-0000-4000-8000-0000000000a4'), array[pg_temp.uid('joiner')],
  'the joiner is the sole member after accepting');
select ok(not exists(select 1 from public.workspace_invites
  where ws_id = '38800000-0000-4000-8000-0000000000a4' and user_id = pg_temp.uid('joiner')),
  'the accepted invite is consumed');
select is(pg_temp.creator_of('38800000-0000-4000-8000-0000000000a4'), pg_temp.uid('creator'),
  'joining does not change creator_id');

-- A SECURITY DEFINER path running under a user JWT (current_user is the
-- definer, auth.role() is 'authenticated') may still change creator_id. This
-- reproduces the removed membership-insert claim trigger on one fixture.
create function pg_temp.wop_definer_claim() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  update public.workspaces w set creator_id = new.user_id
  where w.id = new.ws_id and w.creator_id <> new.user_id
    and not exists (select 1 from public.workspace_members m
      where m.ws_id = new.ws_id and m.user_id <> new.user_id);
  return new;
end $$;
insert into public.workspaces (id, name, personal, creator_id) values
  ('38800000-0000-4000-8000-0000000000a6', 'WOP definer claim', false, pg_temp.uid('creator'));
delete from public.workspace_members where ws_id = '38800000-0000-4000-8000-0000000000a6';
create trigger wop_definer_claim_tr after insert on public.workspace_members
for each row when (new.ws_id = '38800000-0000-4000-8000-0000000000a6')
execute function pg_temp.wop_definer_claim();
insert into public.workspace_invites (ws_id, user_id, type)
values ('38800000-0000-4000-8000-0000000000a6', pg_temp.uid('joiner'), 'MEMBER');
select is(pg_temp.as_role(pg_temp.uid('joiner'), format(
  $q$insert into public.workspace_members (ws_id, user_id, type) values (%L, %L, 'MEMBER')$q$,
  '38800000-0000-4000-8000-0000000000a6', pg_temp.uid('joiner'))), 'ok',
  'invite acceptance succeeds when a definer trigger claims creator_id under the JWT');
select is(pg_temp.creator_of('38800000-0000-4000-8000-0000000000a6'), pg_temp.uid('joiner'),
  'the definer path changed creator_id under an authenticated JWT');
drop trigger wop_definer_claim_tr on public.workspace_members;

-- workspaces_creator_id_fkey ON UPDATE CASCADE still follows a user-id change.
insert into public.users (id, display_name) values ('38800000-0000-4000-8000-0000000000f1', 'WOP fk');
insert into public.workspaces (id, name, personal, creator_id) values
  ('38800000-0000-4000-8000-0000000000a5', 'WOP fk team', false, '38800000-0000-4000-8000-0000000000f1');
delete from public.workspace_members where user_id = '38800000-0000-4000-8000-0000000000f1';
select ok(pg_temp.as_role('38800000-0000-4000-8000-0000000000f1',
  $q$update public.users set id = '38800000-0000-4000-8000-0000000000f2'
  where id = '38800000-0000-4000-8000-0000000000f1'$q$) is not null,
  'a self users.id change attempt runs under the user JWT');
select ok(exists(select 1 from public.users where id = '38800000-0000-4000-8000-0000000000f1'),
  'a user cannot change their own users.id');
select is(pg_temp.creator_of('38800000-0000-4000-8000-0000000000a5'),
  '38800000-0000-4000-8000-0000000000f1'::uuid, 'creator_id is unchanged after the rejected self change');
select is(pg_temp.as_role(null,
  $q$update public.users set id = '38800000-0000-4000-8000-0000000000f2'
  where id = '38800000-0000-4000-8000-0000000000f1'$q$, 'service_role'), 'ok',
  'service_role user-id change succeeds');
select is(pg_temp.creator_of('38800000-0000-4000-8000-0000000000a5'),
  '38800000-0000-4000-8000-0000000000f2'::uuid,
  'the FK cascade moves creator_id under service_role');
delete from public.workspace_members where user_id = '38800000-0000-4000-8000-0000000000f2';
update public.users set id = '38800000-0000-4000-8000-0000000000f3'
where id = '38800000-0000-4000-8000-0000000000f2';
select is(pg_temp.creator_of('38800000-0000-4000-8000-0000000000a5'),
  '38800000-0000-4000-8000-0000000000f3'::uuid,
  'the FK cascade moves creator_id in a migration context');
-- The cascade also succeeds when the user-id change runs on a definer path
-- under an authenticated JWT: the RI action runs as the table owner.
delete from public.workspace_members where user_id = '38800000-0000-4000-8000-0000000000f3';
select set_config('request.jwt.claims', json_build_object('sub',
  pg_temp.uid('outsider'), 'role', 'authenticated')::text, true);
update public.users set id = '38800000-0000-4000-8000-0000000000f4'
where id = '38800000-0000-4000-8000-0000000000f3';
select set_config('request.jwt.claims', '', true);
select is(pg_temp.creator_of('38800000-0000-4000-8000-0000000000a5'),
  '38800000-0000-4000-8000-0000000000f4'::uuid,
  'the FK cascade moves creator_id on a definer path under an authenticated JWT');

select * from finish();
rollback;
