-- tuturuuu: no-grant(trigger)
-- One active identity and at most one in-flight replacement per Auth project.
-- The operation ID also identifies the Auth user, even after a lost HTTP reply.
create table private.fleet_smoke_operations (
  id uuid primary key,
  state text not null check (state in ('pending', 'active', 'retired')),
  workspace_id uuid,
  reserved_at timestamptz not null default clock_timestamp(),
  activated_at timestamptz,
  retired_at timestamptz
);
alter table private.fleet_smoke_operations enable row level security;
revoke all on table private.fleet_smoke_operations from public, anon, authenticated, service_role;
create unique index fleet_smoke_single_pending on private.fleet_smoke_operations (state) where state = 'pending';
create unique index fleet_smoke_single_active on private.fleet_smoke_operations (state) where state = 'active';

create function private.guard_fleet_smoke_auth()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_state text;
  v_policy jsonb := new.raw_app_meta_data -> 'tuturuuu_required_mfa';
  v_email text := 'qa-automation+' || new.id::text || '@smoke.tuturuuu.com';
begin
  if tg_op = 'INSERT' and (lower(new.email) like '%@smoke.tuturuuu.com'
    or new.raw_app_meta_data ? 'tuturuuu_fleet_smoke') then
    if not pg_try_advisory_xact_lock(7903150601) then
      raise exception 'Fleet smoke operation in progress' using errcode = '40001';
    end if;
  end if;
  select state into v_state from private.fleet_smoke_operations where id = new.id;
  if v_state is null then
    if lower(new.email) like '%@smoke.tuturuuu.com'
      or new.raw_app_meta_data ? 'tuturuuu_fleet_smoke' then
      raise exception 'Fleet smoke address is reserved' using errcode = '42501';
    end if;
    return new;
  end if;

  if (tg_op = 'INSERT' and v_state <> 'pending')
    or new.email is distinct from v_email
    or new.raw_app_meta_data -> 'tuturuuu_fleet_smoke' is distinct from 'true'::jsonb
    or new.role is distinct from 'authenticated'
    or v_policy -> 'required' is distinct from 'true'::jsonb
    or v_policy -> 'recoveryInProgress' is distinct from to_jsonb(v_state <> 'active')
  then
    raise exception 'Fleet smoke Auth scope cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_fleet_smoke_auth() from public, anon, authenticated, service_role;
create trigger guard_fleet_smoke_auth before insert or update of id, email, role, raw_app_meta_data on auth.users
for each row execute function private.guard_fleet_smoke_auth();

create function private.guard_fleet_smoke_workspace()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_state text;
begin
  if tg_op = 'UPDATE' and exists (
    select from private.fleet_smoke_operations where id = old.creator_id
  ) then
    if new.creator_id is distinct from old.creator_id or new.personal is distinct from true
      or new.id is distinct from old.id then
      raise exception 'Fleet smoke workspace scope cannot change' using errcode = '42501';
    end if;
    return new;
  end if;

  select state into v_state from private.fleet_smoke_operations where id = new.creator_id;
  if v_state is not null and (tg_op <> 'INSERT' or v_state <> 'pending' or new.personal is distinct from true) then
    raise exception 'Fleet smoke identity is confined to its personal workspace' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_fleet_smoke_workspace() from public, anon, authenticated, service_role;
create trigger guard_fleet_smoke_workspace before insert or update of id, creator_id, personal on public.workspaces
for each row execute function private.guard_fleet_smoke_workspace();

create function private.guard_fleet_smoke_membership()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_ws_id uuid;
  v_fixture_owner uuid;
begin
  if tg_table_name = 'workspace_members' then
    v_ws_id := new.ws_id;
  else
    select ws_id into v_ws_id from public.workspace_roles where id = new.role_id;
  end if;
  select o.id into v_fixture_owner from public.workspaces w
  join private.fleet_smoke_operations o on o.id = w.creator_id
  where w.id = v_ws_id and w.personal;

  if new.user_id is distinct from v_fixture_owner and (
    v_fixture_owner is not null or exists (
      select from private.fleet_smoke_operations where id = new.user_id
    )
  ) then
    raise exception 'Fleet smoke workspace membership cannot cross the fixture boundary' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_fleet_smoke_membership() from public, anon, authenticated, service_role;
create trigger guard_fleet_smoke_membership before insert or update of ws_id, user_id on public.workspace_members
for each row execute function private.guard_fleet_smoke_membership();
create trigger guard_fleet_smoke_role_membership before insert or update of role_id, user_id on public.workspace_role_members
for each row execute function private.guard_fleet_smoke_membership();

-- Only the provisioner can drive transitions. Audit rows contain IDs, state and
-- timestamps. Passwords, seeds and provider sessions never enter the ledger.
create function private.fleet_smoke_transition(p_id uuid, p_action text, p_factor uuid default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_operation private.fleet_smoke_operations%rowtype;
  v_workspace_id uuid;
  v_previous uuid;
  v_now timestamptz := clock_timestamp();
  v_boundary bigint := floor(extract(epoch from v_now));
begin
  if p_id is null or p_action is null or p_action not in ('read', 'reserve', 'activate', 'retire') then
    raise exception 'Unknown fleet smoke operation' using errcode = '22023';
  end if;
  -- Serialize lifecycle changes with the Auth row writes below. Auth creation
  -- takes the same lock in the reservation check before it can insert a user.
  if p_action <> 'read' then
    perform pg_advisory_xact_lock(7903150601);
  end if;
  select * into v_operation from private.fleet_smoke_operations where id = p_id;

  if p_action = 'reserve' then
    if v_operation.id is not null or exists (
      select from private.fleet_smoke_operations where state = 'pending'
    ) or exists (select from auth.users where id = p_id) or exists (
      select from public.users where id = p_id
    ) then
      return null;
    end if;
    insert into private.fleet_smoke_operations (id, state) values (p_id, 'pending') returning * into v_operation;
  elsif v_operation.id is null then
    return null;
  elsif p_action = 'retire' and v_operation.state <> 'retired' then
    update private.fleet_smoke_operations set state = 'retired', retired_at = v_now
      where id = p_id returning * into v_operation;
    v_previous := p_id;
  elsif p_action = 'activate' then
    if v_operation.state <> 'pending' or not exists (
      select from auth.mfa_factors where id = p_factor and user_id = p_id and factor_type = 'totp' and status = 'verified'
    ) then
      return null;
    end if;
    select w.id into v_workspace_id from public.workspaces w
    join public.workspace_members m on m.ws_id = w.id and m.user_id = p_id and m.type = 'MEMBER'
    where w.creator_id = p_id and w.personal and w.deleted is not true;
    if v_workspace_id is null then return null; end if;

    update private.fleet_smoke_operations set state = 'retired', retired_at = v_now
      where state = 'active' returning id into v_previous;
    update private.fleet_smoke_operations set state = 'active', workspace_id = v_workspace_id, activated_at = v_now
      where id = p_id returning * into v_operation;
    update public.workspaces set name = '[QA] Fleet smoke' where id = v_workspace_id;
    update auth.users set raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
      'tuturuuu_required_mfa', jsonb_build_object('required', true, 'verifiedAfter', v_boundary,
        'primaryVerifiedAfter', v_boundary, 'generation', gen_random_uuid(), 'recoveryInProgress', false)
    ) where id = p_id;
    if not found then raise exception 'Fleet smoke Auth identity missing'; end if;
  end if;

  if v_previous is not null then
    -- Apply the GoTrue ban at the same boundary as the audit and revocation.
    -- This leaves no interval in which a retired password can mint a new session
    -- while the provisioner waits for a second provider request.
    update auth.users set
      banned_until = greatest(banned_until, v_now + interval '100 years'),
      raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
        'tuturuuu_required_mfa', jsonb_build_object('required', true, 'verifiedAfter', v_boundary,
          'generation', gen_random_uuid(), 'recoveryInProgress', true)
      )
    where id = v_previous;
    delete from auth.refresh_tokens where user_id::text = v_previous::text;
    delete from auth.sessions where user_id = v_previous;
    delete from auth.mfa_factors where user_id = v_previous and factor_type = 'totp';
  end if;

  return jsonb_build_object('requestId', v_operation.id, 'state', v_operation.state,
    'workspaceId', v_operation.workspace_id, 'activatedAt', v_operation.activated_at,
    'previousId', v_previous);
end;
$$;
revoke all on function private.fleet_smoke_transition(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function private.fleet_smoke_transition(uuid, text, uuid) to service_role;
