begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create temp table rwc_users (label text primary key, id uuid not null);
insert into rwc_users values
  ('creator_b', '1ac00000-0000-4000-8000-000000000001'),
  ('actor', '1ac00000-0000-4000-8000-000000000002'),
  ('outsider', '1ac00000-0000-4000-8000-000000000003');
grant select on rwc_users to authenticated, service_role;

create temp table rwc_workspaces (label text primary key, id uuid not null);
insert into rwc_workspaces values
  ('a', '1ac00000-0000-4000-8000-0000000000a1'),
  ('b', '1ac00000-0000-4000-8000-0000000000b1');
grant select on rwc_workspaces to authenticated, service_role;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select id, 'rwc-' || label || '@example.com', now(), '{}'::jsonb, '{}'::jsonb
from rwc_users;
insert into public.users (id)
select id from rwc_users on conflict (id) do nothing;

create function pg_temp.uid(p_label text) returns uuid language sql stable as $$
  select id from rwc_users where label = p_label
$$;
create function pg_temp.w(p_label text) returns uuid language sql stable as $$
  select id from rwc_workspaces where label = p_label
$$;
create function pg_temp.as_role(p_user uuid, p_sql text, p_role text default 'authenticated')
returns text language plpgsql as $$
declare result text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  perform set_config('rwc.last_error', '', true);
  begin
    execute p_sql;
    result := 'ok';
  exception when others then
    result := sqlstate;
    perform set_config('rwc.last_error', sqlerrm, true);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return result;
end $$;
create function pg_temp.as_err(p_user uuid, p_sql text, p_role text default 'authenticated')
returns text language plpgsql as $$
declare result text := pg_temp.as_role(p_user, p_sql, p_role);
begin
  if coalesce(current_setting('rwc.last_error', true), '') <> '' then
    return result || ': ' || current_setting('rwc.last_error', true);
  end if;
  return result;
end $$;

insert into public.workspaces (id, name, personal, creator_id) values
  (pg_temp.w('a'), 'RWC A', false, pg_temp.uid('actor')),
  (pg_temp.w('b'), 'RWC B', false, pg_temp.uid('creator_b'));
insert into public.workspace_members (ws_id, user_id, type) values
  (pg_temp.w('b'), pg_temp.uid('actor'), 'MEMBER');
insert into public.workspace_roles (id, ws_id, name) values
  ('1ac00000-0000-4000-8000-0000000000c1', pg_temp.w('b'), 'RWC Manager'),
  ('1ac00000-0000-4000-8000-0000000000c2', pg_temp.w('b'), 'RWC Billing'),
  ('1ac00000-0000-4000-8000-0000000000c3', pg_temp.w('b'), 'RWC Service Role'),
  ('1ac00000-0000-4000-8000-0000000000c6', pg_temp.w('b'), 'RWC Disabled Billing');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled) values
  (pg_temp.w('b'), '1ac00000-0000-4000-8000-0000000000c1', 'manage_workspace_roles', true),
  (pg_temp.w('b'), '1ac00000-0000-4000-8000-0000000000c2', 'manage_subscription', true),
  (pg_temp.w('b'), '1ac00000-0000-4000-8000-0000000000c6', 'manage_subscription', false);
insert into public.workspace_role_members (role_id, user_id)
values ('1ac00000-0000-4000-8000-0000000000c1', pg_temp.uid('actor'));

-- Reproduce the name-independent role mutation as a non-creator admin of B.
select is(pg_temp.as_err(pg_temp.uid('actor'), format($q$
  do $body$
  begin
    update public.workspace_roles set ws_id = %L where id = '1ac00000-0000-4000-8000-0000000000c2';
    insert into public.workspace_role_members (role_id, user_id)
    values ('1ac00000-0000-4000-8000-0000000000c2', %L);
  end
  $body$
$q$, pg_temp.w('a'), pg_temp.uid('actor'))),
  '42501: workspace_roles.ws_id cannot be changed by API roles',
  'a B role manager cannot move the creator-granted role into A');
select is(pg_temp.as_err(pg_temp.uid('actor'), format($q$
  do $body$
  begin
    delete from public.workspace_role_members
    where role_id = '1ac00000-0000-4000-8000-0000000000c2' and user_id = %L;
    insert into public.workspace_role_members (role_id, user_id)
    values ('1ac00000-0000-4000-8000-0000000000c2', %L);
  end
  $body$
$q$, pg_temp.uid('actor'), pg_temp.uid('actor'))),
  '42501: only a creator of every workspace holding this role grant can add members',
  'the B role manager cannot add themselves to its creator-granted role');
select is(public.has_workspace_permission(
  pg_temp.w('b'), pg_temp.uid('actor'), 'manage_subscription'), false,
  'the attempted move does not grant B subscription management');

select is(pg_temp.as_err(pg_temp.uid('actor'), $$
  update public.workspace_roles set name = 'Renamed Billing'
  where id = '1ac00000-0000-4000-8000-0000000000c2'
$$),
  '42501: this API caller cannot rename the workspace role',
  'a role manager cannot rename a creator-granted billing role');
select is(pg_temp.as_err(pg_temp.uid('actor'), $$
  update public.workspace_roles set name = 'Renamed Disabled Billing'
  where id = '1ac00000-0000-4000-8000-0000000000c6'
$$),
  '42501: this API caller cannot rename the workspace role',
  'a disabled creator-grant row still protects role renames');
select is(pg_temp.as_err(pg_temp.uid('actor'), format($q$
  insert into public.workspace_role_members (role_id, user_id)
  values ('1ac00000-0000-4000-8000-0000000000c6', %L)
$q$, pg_temp.uid('outsider'))),
  'ok', 'a disabled creator-grant row does not block role-member changes');
select is(pg_temp.as_err(pg_temp.uid('creator_b'), $$
  update public.workspace_roles set name = 'Creator Renamed Billing'
  where id = '1ac00000-0000-4000-8000-0000000000c2'
$$), 'ok', 'the workspace creator may rename its billing role');
select is(pg_temp.as_err(pg_temp.uid('creator_b'), $$
  update public.workspace_roles set name = 'RWC Billing'
  where id = '1ac00000-0000-4000-8000-0000000000c2'
$$), 'ok', 'the creator can restore the billing role name');

-- A non-member cannot see the protected permission row. The trigger must still
-- consult its definer helper so that RLS cannot hide a creator-granted role.
select is(pg_temp.as_err(pg_temp.uid('outsider'), format($q$
  do $body$
  declare v_visible_count integer;
  begin
    select count(*) into v_visible_count
    from public.workspace_role_permissions
    where role_id = '1ac00000-0000-4000-8000-0000000000c2';
    if v_visible_count <> 0 then
      raise exception 'the outsider can see the role permission rows';
    end if;

    insert into public.workspace_role_members (role_id, user_id)
    values ('1ac00000-0000-4000-8000-0000000000c2', %L);
  end
  $body$
$q$, pg_temp.uid('outsider'))),
  '42501: only a creator of every workspace holding this role grant can add members',
  'an RLS-hidden creator grant still blocks an outsider role-member insert');

-- Hide role permission rows from the B role manager; the rename guard must not
-- depend on what the caller can read.
create policy rwc_hide_role_permissions on public.workspace_role_permissions
  as restrictive for select to authenticated using (false);
select is(pg_temp.as_err(pg_temp.uid('actor'), $$
  do $body$
  declare v_visible_count integer;
  begin
    select count(*) into v_visible_count
    from public.workspace_role_permissions
    where role_id = '1ac00000-0000-4000-8000-0000000000c2';
    if v_visible_count <> 0 then
      raise exception 'the role manager can see the role permission rows';
    end if;

    update public.workspace_roles set name = 'Hidden Renamed Billing'
    where id = '1ac00000-0000-4000-8000-0000000000c2';
  end
  $body$
$$),
  '42501: this API caller cannot rename the workspace role',
  'an RLS-hidden creator grant still blocks a role-manager rename');
select is(pg_temp.as_err(pg_temp.uid('actor'), $$
  update public.workspace_roles set name = 'RWC Billing'
  where id = '1ac00000-0000-4000-8000-0000000000c2'
$$), 'ok', 'a same-name save of a creator-granted role is allowed');
select is(pg_temp.as_err(pg_temp.uid('actor'), $$
  update public.workspace_roles set name = 'RWC Manager Renamed'
  where id = '1ac00000-0000-4000-8000-0000000000c1'
$$), 'ok', 'a role manager can rename a plain role');
select is(pg_temp.as_err(pg_temp.uid('actor'), $$
  update public.workspace_roles set name = 'RWC Manager'
  where id = '1ac00000-0000-4000-8000-0000000000c1'
$$), 'ok', 'a role manager can restore a plain role name');
drop policy rwc_hide_role_permissions on public.workspace_role_permissions;

select set_config('request.jwt.claims', json_build_object(
  'sub', pg_temp.uid('outsider'), 'role', 'authenticated')::text, true);
select is(public.can_add_creator_grant_role_member(
  '1ac00000-0000-4000-8000-0000000000c2', pg_temp.uid('outsider')),
  false, 'the wrapper does not disclose creator-grant state to workspace outsiders');
select is(public.can_rename_creator_grant_role(
  '1ac00000-0000-4000-8000-0000000000c2', pg_temp.uid('outsider')),
  false, 'the rename wrapper does not disclose creator-grant state to workspace outsiders');
select set_config('request.jwt.claims', '', true);

select ok(not has_function_privilege(
  'anon', 'public.can_add_creator_grant_role_member(uuid, uuid)', 'EXECUTE'),
  'anon cannot execute the creator-grant wrapper');
select ok(has_function_privilege(
  'authenticated', 'public.can_add_creator_grant_role_member(uuid, uuid)', 'EXECUTE'),
  'authenticated can execute the creator-grant wrapper for the trigger');
select ok(not has_function_privilege(
  'anon', 'public.can_rename_creator_grant_role(uuid, uuid)', 'EXECUTE'),
  'anon cannot execute the creator-grant rename wrapper');
select ok(has_function_privilege(
  'authenticated', 'public.can_rename_creator_grant_role(uuid, uuid)', 'EXECUTE'),
  'authenticated can execute the creator-grant rename wrapper');

select is((select count(*)::integer from pg_trigger
  where tgrelid = 'public.workspace_roles'::regclass
    and tgname = 'workspace_roles_ws_id_immutable' and not tgisinternal),
  1, 'the workspace id immutability trigger is installed');
select is((select count(*)::integer from pg_trigger
  where tgrelid = 'public.workspace_roles'::regclass
    and tgname = 'prevent_workspace_role_creator_grant_rename' and not tgisinternal),
  1, 'the creator-granted role rename guard is installed');
select is((select count(*)::integer from pg_constraint
  where conrelid = 'public.workspace_role_permissions'::regclass
    and conname = 'workspace_role_permissions_ws_role_fkey' and contype = 'f'),
  1, 'role permission rows reference their role workspace');
select is((select count(*)::integer from pg_constraint
  where conrelid = 'public.workspace_role_permissions'::regclass
    and confrelid = 'public.workspace_roles'::regclass
    and contype = 'f'),
  1, 'exactly one foreign key relationship remains between the role tables');
select throws_ok(format($q$
  insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
  values (%L, '1ac00000-0000-4000-8000-0000000000c2', 'manage_workspace_members', true)
$q$, pg_temp.w('a')),
  '23503', null, 'the composite foreign key rejects mismatched permission rows');

-- Internal service-role maintenance can move a role and its scoped permission.
select is(pg_temp.as_err(pg_temp.uid('actor'), $$
  update public.workspace_roles set name = 'Renamed Manager'
  where id = '1ac00000-0000-4000-8000-0000000000c1'
$$, 'service_role'), 'ok', 'service_role can rename a plain role');
select is(pg_temp.as_err(pg_temp.uid('actor'), $$
  update public.workspace_roles set name = 'Renamed Manager'
  where id = '1ac00000-0000-4000-8000-0000000000c1'
$$, 'service_role'), 'ok', 'service_role can save a role name without changing it');
select is(pg_temp.as_err(pg_temp.uid('actor'), $$
  update public.workspace_roles set name = 'Service Renamed Billing'
  where id = '1ac00000-0000-4000-8000-0000000000c2'
$$, 'service_role'), 'ok', 'service_role can save a creator-grant role after the API guard');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values (pg_temp.w('b'), '1ac00000-0000-4000-8000-0000000000c3', 'manage_subscription', true);
insert into public.workspace_role_members (role_id, user_id)
values ('1ac00000-0000-4000-8000-0000000000c3', pg_temp.uid('actor'));
select is(public.has_workspace_permission(
  pg_temp.w('b'), pg_temp.uid('actor'), 'manage_subscription'), true,
  'the role initially provides its workspace permission');
select is(pg_temp.as_err(pg_temp.uid('actor'), format($q$
  update public.workspace_roles set ws_id = %L where id = '1ac00000-0000-4000-8000-0000000000c3'
$q$, pg_temp.w('a')), 'service_role'),
  'ok', 'service_role can update workspace_roles.ws_id');
select is((select ws_id from public.workspace_roles
  where id = '1ac00000-0000-4000-8000-0000000000c3'),
  pg_temp.w('a'), 'the service-role workspace change is persisted');
select is(public.has_workspace_permission(
  pg_temp.w('b'), pg_temp.uid('actor'), 'manage_subscription'), false,
  'a moved role no longer grants its former workspace permission');

select ok(exists (
  select 1
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'workspace_role_creator_grants_owned_by_actor'
    and p.pronargs = 2
    and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
), 'the internal creator ownership helper exists and is not executable by authenticated');

select * from finish();
rollback;
