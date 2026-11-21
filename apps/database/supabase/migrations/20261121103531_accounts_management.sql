begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter table private.qa_test_user_events
  add column actor_kind private.accounts_actor_kind,
  add column operation_id uuid,
  add column phase text not null default 'success'
    check (phase in ('intent', 'success', 'failure', 'unknown', 'denied')),
  alter column run_id drop not null,
  drop constraint qa_test_user_events_action_check;
create temp table accounts_audit_backfill_counts (
  expected bigint, attributed bigint, check (expected = attributed)
) on commit drop;
with migrated as (
  update private.qa_test_user_events
  set actor_kind = case when actor = 'operator' and actor_user_id is not null
      then 'human'::private.accounts_actor_kind else 'system'::private.accounts_actor_kind end,
    actor_user_id = case when actor = 'operator' and actor_user_id is not null
      then actor_user_id else 'ffffffff-ffff-4fff-bfff-ffffffffffff' end,
    detail = detail - 'purpose'
  returning actor_kind, actor_user_id
)
insert into pg_temp.accounts_audit_backfill_counts
select (select count(*) from private.qa_test_user_events), count(*)
from migrated where actor_kind is not null and actor_user_id is not null;
alter table private.qa_test_user_events
  alter column actor_kind set not null,
  alter column actor_user_id set not null,
  add constraint accounts_actor_identity check (
    (actor_kind = 'system') = (actor_user_id = 'ffffffff-ffff-4fff-bfff-ffffffffffff')),
  add constraint accounts_event_action check (
    action in ('create', 'session', 'delete', 'workspace_create', 'workspace_delete',
      'invite', 'role', 'admin', 'disable', 'enable', 'human-delete', 'test-create', 'test-delete'));
alter table private.qa_test_user_events force row level security;
create index accounts_audit_age on private.qa_test_user_events (occurred_at, id);
create index accounts_audit_operation on private.qa_test_user_events (operation_id)
  where operation_id is not null;
create table private.accounts_operations (
  id uuid primary key,
  actor_kind private.accounts_actor_kind not null check (actor_kind in ('human', 'machine')),
  actor_id uuid not null check (actor_id <> 'ffffffff-ffff-4fff-bfff-ffffffffffff'),
  action text not null check (action in ('invite', 'role', 'admin', 'disable', 'enable',
    'human-delete', 'test-create', 'test-delete')),
  target_id uuid,
  state text not null default 'intent' check (state in ('intent', 'unknown', 'success', 'failure')),
  created_at timestamptz not null default clock_timestamp()
);
create index accounts_operations_unresolved on private.accounts_operations (created_at, id)
  where state in ('intent', 'unknown');
create index accounts_operations_actor_age on private.accounts_operations (actor_id, created_at);
create table private.accounts_machine_registry (
  runner_id uuid primary key references private.devbox_runners on delete cascade,
  enabled boolean not null,
  changed_by uuid not null,
  changed_at timestamptz not null default clock_timestamp()
);
alter table private.qa_test_runs
  add column accounts_machine_id uuid,
  add column accounts_operation_id uuid unique,
  add constraint accounts_machine_run_attribution check (
    accounts_machine_id is null or
    (accounts_machine_id = operator_user_id and accounts_operation_id is not null and not workspace_requested));
create index accounts_machine_runs ON private.qa_test_runs (accounts_machine_id, id)
  where accounts_machine_id is not null;
create table private.accounts_suspension_reasons (
  user_id uuid primary key,
  active boolean not null,
  operation_id uuid not null,
  changed_by uuid not null,
  changed_at timestamptz not null default clock_timestamp()
);
create table private.accounts_control (
  singleton boolean primary key default true check (singleton),
  purge_enabled boolean not null default true,
  suspension_enabled boolean not null default false,
  human_delete_enabled boolean not null default false
);
insert into private.accounts_control default values;
revoke all on private.accounts_operations, private.accounts_machine_registry,
  private.accounts_suspension_reasons, private.accounts_control
  from public, anon, authenticated, service_role;
alter table private.accounts_operations enable row level security;
alter table private.accounts_machine_registry enable row level security;
alter table private.accounts_suspension_reasons enable row level security;
alter table private.accounts_control enable row level security;
-- tuturuuu: no-grant (trigger)
create function private.accounts_audit_provenance()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp
as $$
begin
  if new.operation_id is not null then
    return new;
  elsif new.actor = 'cron' and new.actor_user_id is null then
    new.actor_kind := 'system';
    new.actor_user_id := 'ffffffff-ffff-4fff-bfff-ffffffffffff';
  elsif new.actor = 'operator' and new.actor_user_id is not null then
    new.actor_kind := case when exists (
      select from private.qa_test_runs r where r.id = new.run_id
        and r.accounts_machine_id = new.actor_user_id
    ) then 'machine'::private.accounts_actor_kind else 'human'::private.accounts_actor_kind end;
  else
    raise exception 'QA audit requires an explicit actor' using errcode = '42501';
  end if;
  new.detail := new.detail - 'purpose';
  return new;
end;
$$;
revoke all on function private.accounts_audit_provenance() from public, anon, authenticated, service_role;
create trigger accounts_audit_provenance before insert on private.qa_test_user_events
for each row execute function private.accounts_audit_provenance();
alter table private.qa_test_user_events enable always trigger accounts_audit_provenance;
-- tuturuuu: no-grant (internal)
create function private.accounts_audit_cutoff(p_phase text)
returns timestamptz language sql stable set search_path = pg_catalog, pg_temp
as $$
  select statement_timestamp() - case when p_phase = 'denied' then interval '2160 hours'
    else interval '8760 hours' end
$$;
revoke all on function private.accounts_audit_cutoff(text) from public, anon, authenticated, service_role;
-- tuturuuu: no-grant (trigger)
create function private.accounts_audit_immutable()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op <> 'DELETE' then
    raise exception 'Account audit is append-only' using errcode = '42501';
  end if;
  if old.occurred_at >= private.accounts_audit_cutoff(old.phase)
    or (old.operation_id is not null and old.phase <> 'denied' and not exists (
      select from private.accounts_operations where id = old.operation_id
        and state in ('success', 'failure'))) then
    raise exception 'Account audit retention boundary' using errcode = '42501';
  end if;
  return old;
end;
$$;
revoke all on function private.accounts_audit_immutable() from public, anon, authenticated, service_role;
create trigger accounts_audit_immutable_rows before update or delete on private.qa_test_user_events
for each row execute function private.accounts_audit_immutable();
create trigger accounts_audit_immutable_table before truncate on private.qa_test_user_events
for each statement execute function private.accounts_audit_immutable();
alter table private.qa_test_user_events enable always trigger accounts_audit_immutable_rows;
alter table private.qa_test_user_events enable always trigger accounts_audit_immutable_table;
create function private.accounts_human_allowed(p_actor uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select from public.platform_user_roles p join auth.users u on u.id = p.user_id
    where p.user_id = p_actor and p.enabled and p.allow_role_management
      and (u.banned_until is null or u.banned_until <= statement_timestamp())
      and lower(u.email) like '%@tuturuuu.com'
      and private.staff_identity_verified(u.id)
      and public.has_workspace_permission(
        '00000000-0000-0000-0000-000000000000', u.id, 'manage_workspace_roles'))
$$;
revoke all on function private.accounts_human_allowed(uuid) from public, anon, authenticated, service_role;
grant execute on function private.accounts_human_allowed(uuid) to service_role;
create function private.accounts_fresh_totp(p_actor uuid, p_session uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select from auth.sessions s join auth.mfa_amr_claims a on a.session_id = s.id
    join auth.mfa_factors f on f.id = s.factor_id and f.user_id = s.user_id
    where s.id = p_session and s.user_id = p_actor and s.aal = 'aal2'
      and (s.not_after is null or s.not_after > statement_timestamp())
      and f.factor_type = 'totp' and f.status = 'verified'
      and a.authentication_method = 'totp'
      and a.updated_at between statement_timestamp() - interval '300 seconds' and statement_timestamp())
$$;
revoke all on function private.accounts_fresh_totp(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.accounts_fresh_totp(uuid, uuid) to service_role;
create function private.accounts_set_machine(p_actor uuid, p_session uuid, p_runner uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if not private.accounts_human_allowed(p_actor) or not private.accounts_fresh_totp(p_actor, p_session) then
    raise exception 'Account authority refused' using errcode = '42501';
  end if;
  insert into private.accounts_machine_registry (runner_id, enabled, changed_by)
  values (p_runner, p_enabled, p_actor)
  on conflict (runner_id) do update
    set enabled = excluded.enabled, changed_by = excluded.changed_by, changed_at = clock_timestamp();
end;
$$;
revoke all on function private.accounts_set_machine(uuid, uuid, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function private.accounts_set_machine(uuid, uuid, uuid, boolean) to service_role;
create function private.accounts_machine_credential(p_hash text)
returns jsonb language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object('runnerId', r.runner_id, 'credentialId', t.id)
  from private.accounts_machine_registry r
  join private.devbox_runners d on d.id = r.runner_id
  join private.devbox_runner_tokens t on t.runner_id = r.runner_id
  where r.enabled and d.status <> 'revoked' and t.revoked_at is null and t.token_hash = p_hash
$$;
revoke all on function private.accounts_machine_credential(text) from public, anon, authenticated, service_role;
grant execute on function private.accounts_machine_credential(text) to service_role;
-- tuturuuu: no-grant (internal)
create function private.accounts_check_machine(p_actor uuid, p_credential uuid)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  perform from private.accounts_machine_registry r
  where r.runner_id = p_actor and r.enabled for share of r;
  if not found or not exists (
    select from private.devbox_runner_tokens t join private.devbox_runners d on d.id = t.runner_id
    where t.id = p_credential and t.runner_id = p_actor and t.revoked_at is null and d.status <> 'revoked'
  ) then
    raise exception 'Machine enrollment refused' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.accounts_check_machine(uuid, uuid) from public, anon, authenticated, service_role;
-- tuturuuu: no-grant (internal)
create function private.accounts_event(
  p_operation uuid, p_actor uuid, p_kind private.accounts_actor_kind, p_action text,
  p_phase text, p_target uuid
)
returns void language sql set search_path = pg_catalog, pg_temp
as $$
  insert into private.qa_test_user_events
    (operation_id, action, actor, actor_kind, actor_user_id, phase, user_id)
  values (p_operation, p_action, 'operator', p_kind, p_actor, p_phase, p_target)
$$;
revoke all on function private.accounts_event(uuid, uuid, private.accounts_actor_kind, text, text, uuid)
  from public, anon, authenticated, service_role;
create function private.accounts_deny(p_operation uuid, p_actor uuid, p_credential uuid, p_action text)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if p_credential is not null then
    perform private.accounts_check_machine(p_actor, p_credential);
  end if;
  perform private.accounts_event(p_operation, p_actor,
    case when p_credential is null then 'human' else 'machine' end::private.accounts_actor_kind,
    p_action, 'denied', null);
end;
$$;
revoke all on function private.accounts_deny(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.accounts_deny(uuid, uuid, uuid, text) to service_role;
-- tuturuuu: no-grant (internal)
create function private.accounts_target(p_user uuid)
returns boolean language sql stable set search_path = pg_catalog, pg_temp
as $$
  select exists (select from auth.users u where u.id = p_user and lower(u.email) like '%@tuturuuu.com'
    and not (coalesce(u.raw_app_meta_data, '{}'::jsonb) ? 'qa_test')
    and not private.is_qa_test_address(u.email))
$$;
revoke all on function private.accounts_target(uuid) from public, anon, authenticated, service_role;
create table private.accounts_invite_window (
  address_key bigint primary key,
  admitted_at timestamptz not null
);
alter table private.accounts_invite_window enable row level security;
revoke all on private.accounts_invite_window from public, anon, authenticated, service_role;
create index accounts_invite_window_age on private.accounts_invite_window (admitted_at, address_key);
-- tuturuuu: no-grant (internal)
create function private.accounts_admit_invite(p_email text)
returns boolean language sql set search_path = pg_catalog, pg_temp
as $$
  with admitted as (
    insert into private.accounts_invite_window as w (address_key, admitted_at)
    values (hashtextextended(p_email, 0), clock_timestamp())
    on conflict (address_key) do update set admitted_at = excluded.admitted_at
      where w.admitted_at <= excluded.admitted_at - interval '24 hours'
    returning 1
  ) select exists (select from admitted)
$$;
revoke all on function private.accounts_admit_invite(text) from public, anon, authenticated, service_role;
create function private.accounts_begin(
  p_operation uuid, p_actor uuid, p_credential uuid, p_action text, p_target uuid, p_email text
)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_kind private.accounts_actor_kind := case when p_credential is null then 'human' else 'machine' end;
begin
  if v_kind = 'machine' then
    perform private.accounts_check_machine(p_actor, p_credential);
    if p_action not in ('test-create', 'test-delete') then
      raise exception 'Machine action refused' using errcode = '42501';
    end if;
  elsif not private.accounts_human_allowed(p_actor) then
    raise exception 'Account authority refused' using errcode = '42501';
  end if;
  if p_action in ('disable', 'enable', 'human-delete') and not (
    select case when p_action = 'human-delete' then human_delete_enabled else suspension_enabled end
    from private.accounts_control where singleton
  ) then
    raise exception 'Account lifecycle mutation unavailable' using errcode = '55000';
  elsif p_action = 'human-delete' then
    raise exception 'Human deletion pipeline unavailable' using errcode = '55000';
  end if;
  if p_action = 'invite' then
    if p_email is null or length(p_email) > 254 or p_email !~ '^[^@[:space:]]+@tuturuuu[.]com$'
      or private.is_qa_test_address(p_email)
      or exists (select from auth.users where lower(email) = p_email)
      or exists (select from public.platform_email_roles where lower(email) = p_email) then
      raise exception 'Account unavailable' using errcode = 'P0002';
    end if;
  elsif p_action = 'test-delete' then
    if not exists (
      select from private.qa_test_users u join private.qa_test_runs r on r.id = u.run_id
      where u.user_id = p_target and not u.staff and r.accounts_operation_id is not null
        and (v_kind = 'human' or r.accounts_machine_id = p_actor)
    ) then
      raise exception 'Account unavailable' using errcode = 'P0002';
    end if;
  elsif p_action <> 'test-create' and not private.accounts_target(p_target) then
    raise exception 'Account unavailable' using errcode = 'P0002';
  end if;

  -- Serialize per actor admission and normalized invitation admission.
  perform pg_advisory_xact_lock(hashtextextended('accounts-actor:' || p_actor, 0));
  if (select count(*) from private.accounts_operations
      where actor_id = p_actor and created_at > clock_timestamp() - interval '1 hour') >= 60 then
    raise exception 'Account operation limit reached' using errcode = '54000';
  end if;
  if p_action = 'invite' then
    perform pg_advisory_xact_lock(hashtextextended('accounts-address:' || p_email, 0));
    -- Hash is deliberately absent from the append-only audit log.
    if not private.accounts_admit_invite(p_email) then
      raise exception 'Account invitation limit reached' using errcode = '54000';
    end if;
  end if;
  insert into private.accounts_operations (id, actor_kind, actor_id, action, target_id)
    values (p_operation, v_kind, p_actor, p_action, p_target);
  perform private.accounts_event(p_operation, p_actor, v_kind, p_action, 'intent', p_target);
end;
$$;
revoke all on function private.accounts_begin(uuid, uuid, uuid, text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.accounts_begin(uuid, uuid, uuid, text, uuid, text) to service_role;
-- tuturuuu: no-grant (internal)
create function private.accounts_lock_operation(p_operation uuid, p_actor uuid, p_credential uuid)
returns private.accounts_operations language plpgsql set search_path = pg_catalog, pg_temp
as $$
declare v_op private.accounts_operations;
begin
  if p_credential is not null then
    perform private.accounts_check_machine(p_actor, p_credential);
  end if;
  select * into v_op from private.accounts_operations where id = p_operation for update;
  if v_op.id is null or v_op.actor_id is distinct from p_actor or v_op.actor_kind <>
    (case when p_credential is null then 'human' else 'machine' end)::private.accounts_actor_kind then
    raise exception 'Account operation unavailable' using errcode = 'P0002';
  end if;
  return v_op;
end;
$$;
revoke all on function private.accounts_lock_operation(uuid, uuid, uuid) from public, anon, authenticated, service_role;
-- tuturuuu: no-grant (internal)
create function private.accounts_finish_locked(p_op private.accounts_operations, p_phase text, p_target uuid)
returns boolean language plpgsql set search_path = pg_catalog, pg_temp
as $$
declare
  v_target uuid := coalesce(p_op.target_id, p_target);
begin
  if p_op.state in ('success', 'failure') or p_op.state = p_phase then
    return p_op.state = p_phase and (p_target is null or p_target = p_op.target_id);
  end if;
  if p_phase is null or p_phase not in ('success', 'failure', 'unknown')
    or (p_target is not null and p_op.target_id is not null and p_target <> p_op.target_id) then
    raise exception 'Invalid account outcome' using errcode = '22023';
  end if;
  if p_phase = 'success' then
    case p_op.action
      when 'disable', 'enable' then
        if not exists (select from private.accounts_suspension_reasons
          where user_id = v_target and operation_id = p_op.id and active = (p_op.action = 'disable')) then
          return false;
        end if;
      when 'test-create' then
        if not exists (select from private.qa_test_users u join private.qa_test_runs r on r.id = u.run_id
          where u.user_id = v_target and not u.staff and u.activated_at is not null and r.accounts_operation_id = p_op.id) then
          return false;
        end if;
      when 'test-delete' then
        if not exists (select from private.qa_test_users where user_id = v_target and state = 'deleted') then
          return false;
        end if;
      when 'invite' then
        if not private.accounts_target(v_target) then return false; end if;
      else
        -- Role and admin writes record success in the same transaction as the change.
        if p_op.action not in ('role', 'admin') then return false; end if;
    end case;
  end if;
  update private.accounts_operations set state = p_phase, target_id = v_target where id = p_op.id;
  perform private.accounts_event(p_op.id, p_op.actor_id, p_op.actor_kind, p_op.action, p_phase, v_target);
  return true;
end;
$$;
revoke all on function private.accounts_finish_locked(private.accounts_operations, text, uuid)
  from public, anon, authenticated, service_role;
create function private.accounts_finish(p_operation uuid, p_actor uuid, p_credential uuid, p_phase text, p_target uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_op private.accounts_operations := private.accounts_lock_operation(p_operation, p_actor, p_credential);
begin
  if p_phase = 'success' and v_op.state <> 'success' and v_op.action in ('admin', 'role', 'human-delete') then
    return false;
  end if;
  return private.accounts_finish_locked(v_op, p_phase, p_target);
end;
$$;
revoke all on function private.accounts_finish(uuid, uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function private.accounts_finish(uuid, uuid, uuid, text, uuid) to service_role;
create function private.accounts_reserve_test(p_operation uuid, p_actor uuid, p_credential uuid, p_label text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_op private.accounts_operations := private.accounts_lock_operation(p_operation, p_actor, p_credential);
  v_result jsonb;
begin
  if v_op.action <> 'test-create' or v_op.state <> 'intent' or v_op.target_id is not null
    or p_label is null or p_label not in ('a1', 'a2') then
    raise exception 'Account operation unavailable' using errcode = 'P0002';
  end if;
  if p_credential is not null then
    perform pg_advisory_xact_lock(7903150603);
    if exists (
      select from private.qa_test_users u join private.qa_test_runs r on r.id = u.run_id
      where r.accounts_machine_id is not null and (u.state <> 'deleted'
        or u.created_at > clock_timestamp() - interval '24 hours')
      having count(*) filter (where u.state <> 'deleted') >= 30
        or count(*) filter (where u.created_at > clock_timestamp() - interval '24 hours') >= 60
        or count(*) filter (where r.accounts_machine_id = p_actor and u.state <> 'deleted') >= 5
        or count(*) filter (where r.accounts_machine_id = p_actor
          and u.created_at > clock_timestamp() - interval '24 hours') >= 10
    ) then
      raise exception 'Machine QA quota reached' using errcode = '54000';
    end if;
  elsif not private.accounts_human_allowed(p_actor) then
    raise exception 'Account authority refused' using errcode = '42501';
  end if;
  v_result := private.qa_test_reserve_users(p_actor, null, 'accounts-' || p_label, 3600, 1, false, 'FREE', false);
  update private.qa_test_runs set accounts_operation_id = p_operation,
    accounts_machine_id = case when p_credential is not null then p_actor end
    where id = v_result ->> 'runId';
  update private.accounts_operations set target_id = (v_result #>> '{users,0,userId}')::uuid
    where id = p_operation;
  return v_result;
end;
$$;
revoke all on function private.accounts_reserve_test(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.accounts_reserve_test(uuid, uuid, uuid, text) to service_role;
create function private.accounts_test_step(p_operation uuid, p_actor uuid, p_credential uuid, p_step text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_op private.accounts_operations := private.accounts_lock_operation(p_operation, p_actor, p_credential);
  v_result jsonb;
begin
  if p_credential is null and not private.accounts_human_allowed(p_actor) then
    raise exception 'Account authority refused' using errcode = '42501';
  end if;
  if v_op.action = 'test-delete' and p_step = 'finish' and v_op.state = 'success' then
    return jsonb_build_object('state', 'deleted');
  end if;
  if v_op.state <> 'intent' or v_op.target_id is null then
    raise exception 'Account operation unavailable' using errcode = 'P0002';
  end if;
  if v_op.action = 'test-create' and p_step = 'activate' then
    v_result := private.qa_test_activate_user(v_op.target_id, p_actor);
    if v_result is not null and not private.accounts_finish_locked(v_op, 'success', null) then
      raise exception 'Account activation unsettled' using errcode = '55000';
    end if;
  elsif v_op.action = 'test-delete' and p_step = 'begin' then
    v_result := private.qa_test_begin_delete(v_op.target_id, 'operator', p_actor);
  elsif v_op.action = 'test-delete' and p_step = 'finish' then
    v_result := private.qa_test_finish_delete(v_op.target_id, 'operator', p_actor);
    if v_result ->> 'state' = 'deleted' and not private.accounts_finish_locked(v_op, 'success', null) then
      raise exception 'Account deletion unsettled' using errcode = '55000';
    end if;
  else
    raise exception 'Account operation unavailable' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;
revoke all on function private.accounts_test_step(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.accounts_test_step(uuid, uuid, uuid, text) to service_role;
create function private.accounts_apply_human(
  p_operation uuid, p_actor uuid, p_session uuid, p_workspace uuid, p_role uuid, p_enabled boolean
)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_op private.accounts_operations := private.accounts_lock_operation(p_operation, p_actor, null);
begin
  if v_op.state <> 'intent' or not private.accounts_human_allowed(p_actor)
    or v_op.target_id = p_actor or not private.accounts_target(v_op.target_id) then
    raise exception 'Account unavailable' using errcode = 'P0002';
  end if;
  if v_op.action = 'role' then
    if not private.staff_identity_verified(v_op.target_id)
      or p_workspace is null or p_workspace = '00000000-0000-0000-0000-000000000000'
      or not public.has_workspace_permission(p_workspace, p_actor, 'manage_workspace_roles')
      or not public.is_org_member(p_actor, p_workspace) or not public.is_org_member(v_op.target_id, p_workspace)
      or not exists (select from public.workspace_roles where id = p_role and ws_id = p_workspace)
      or not private.workspace_role_creator_grants_owned_by_actor(p_role, p_actor) then
      raise exception 'Account unavailable' using errcode = 'P0002';
    end if;
    insert into public.workspace_role_members (role_id, user_id)
      values (p_role, v_op.target_id) on conflict do nothing;
  elsif v_op.action = 'admin' then
    if p_enabled is null or not private.accounts_human_allowed(p_actor)
      or not private.accounts_fresh_totp(p_actor, p_session)
      or (p_enabled and not private.staff_identity_verified(v_op.target_id)) then
      raise exception 'Account authority refused' using errcode = '42501';
    end if;
    if p_enabled then
      insert into public.platform_user_roles (user_id, enabled, allow_role_management)
        values (v_op.target_id, true, true)
        on conflict (user_id) do update set enabled = true, allow_role_management = true
          where public.platform_user_roles.enabled
            or not (public.platform_user_roles.allow_challenge_management
              or public.platform_user_roles.allow_manage_all_challenges
              or public.platform_user_roles.allow_workspace_creation
              or public.platform_user_roles.allow_discord_integrations);
      if not found then
        raise exception 'Account unavailable' using errcode = 'P0002';
      end if;
    else
      update public.platform_user_roles set allow_role_management = false where user_id = v_op.target_id;
    end if;
    if private.require_platform_role_write_actor() is distinct from p_actor then
      raise exception 'Account authority refused' using errcode = '42501';
    end if;
  elsif v_op.action in ('disable', 'enable') then
    perform pg_advisory_xact_lock(hashtextextended('accounts-suspension:' || v_op.target_id, 0));
    if not (select suspension_enabled from private.accounts_control where singleton) then
      raise exception 'Account suspension unavailable' using errcode = '55000';
    end if;
    -- D292 owns the Auth write. Record only a verified transition with Accounts provenance.
    if not private.accounts_fresh_totp(p_actor, p_session) or not exists (
      select from auth.users where id = v_op.target_id
        and coalesce(banned_until > statement_timestamp(), false) = (v_op.action = 'disable')
    ) or (v_op.action = 'enable' and not exists (select from private.accounts_suspension_reasons
      where user_id = v_op.target_id and active)) then
      raise exception 'Account suspension unsettled' using errcode = '55000';
    end if;
    insert into private.accounts_suspension_reasons (user_id, active, operation_id, changed_by)
      values (v_op.target_id, v_op.action = 'disable', v_op.id, p_actor)
      on conflict (user_id) do update set active = excluded.active, operation_id = excluded.operation_id,
        changed_by = excluded.changed_by, changed_at = clock_timestamp();
  else
    raise exception 'Account operation unavailable' using errcode = 'P0002';
  end if;
  if not private.accounts_finish_locked(v_op, 'success', null) then
    raise exception 'Account mutation unsettled' using errcode = '55000';
  end if;
end;
$$;
revoke all on function private.accounts_apply_human(uuid, uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function private.accounts_apply_human(uuid, uuid, uuid, uuid, uuid, boolean) to service_role;
create function private.accounts_read(p_actor uuid, p_target uuid, p_cursor uuid, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$
declare v_account jsonb;
begin
  if not private.accounts_human_allowed(p_actor) then
    raise exception 'Account authority refused' using errcode = '42501';
  end if;
  if p_target is not null then
    select jsonb_build_object('id', u.id, 'email', u.email, 'test', false,
      'disabled', coalesce(u.banned_until > statement_timestamp(), false)) into v_account
    from auth.users u where u.id = p_target and private.accounts_target(u.id);
    if v_account is null then raise exception 'Account unavailable' using errcode = 'P0002'; end if;
    return jsonb_build_object('account', v_account);
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid account limit' using errcode = '22023';
  end if;
  return (
    with page as (
      select id, banned_until, row_number() over (order by id) as position
      from auth.users where (p_cursor is null or id > p_cursor) and lower(email) like '%@tuturuuu.com'
        and not (coalesce(raw_app_meta_data, '{}'::jsonb) ? 'qa_test')
        and not private.is_qa_test_address(email)
      order by id limit p_limit + 1
    )
    select jsonb_build_object('accounts', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'maskedEmail', '***@tuturuuu.com', 'test', false,
      'disabled', coalesce(banned_until > statement_timestamp(), false))
      order by id) filter (where position <= p_limit), '[]'::jsonb),
      'nextCursor', case when count(*) > p_limit then
        (array_agg(id) filter (where position = p_limit))[1] end)
    from page
  );
end;
$$;
revoke all on function private.accounts_read(uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function private.accounts_read(uuid, uuid, uuid, integer) to service_role;
create function private.accounts_reconcile(p_limit integer)
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_count integer := 0;
  v_op private.accounts_operations;
begin
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'Invalid account reconciliation limit' using errcode = '22023';
  end if;
  perform from private.accounts_control where singleton and purge_enabled for share;
  if not found then return 0; end if;
  for v_op in
    select * from private.accounts_operations o where o.state in ('intent', 'unknown')
      and o.action in ('disable', 'enable', 'test-create', 'test-delete')
      and o.created_at <= statement_timestamp() - interval '10 minutes'
      and (exists (select from private.qa_test_users u where u.user_id = o.target_id
          and ((o.action = 'test-create' and u.state in ('active', 'deleted'))
            or (o.action = 'test-delete' and u.state = 'deleted')))
        or exists (select from private.accounts_suspension_reasons s
          where s.user_id = o.target_id and s.operation_id = o.id
            and s.active = (o.action = 'disable')))
    order by o.created_at, o.id limit p_limit for update of o skip locked
  loop
    if private.accounts_finish_locked(v_op, case when v_op.action = 'test-create' and exists
      (select from private.qa_test_users where user_id = v_op.target_id and state = 'deleted'
        and activated_at is null) then 'failure' else 'success' end, null) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.accounts_reconcile(integer) from public, anon, authenticated, service_role;
grant execute on function private.accounts_reconcile(integer) to service_role;
create function private.accounts_purge(p_limit integer)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp set statement_timeout = '8s'
as $$
declare
  v_deleted integer;
  v_operations integer;
  v_invites integer;
  v_lag boolean;
begin
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'Invalid account purge limit' using errcode = '22023';
  end if;
  perform from private.accounts_control where singleton and purge_enabled for share;
  if not found then return jsonb_build_object('fenced', true, 'deleted', 0, 'lagging', false); end if;
  if not pg_try_advisory_xact_lock(7903150605) then
    return jsonb_build_object('fenced', false, 'deleted', 0, 'lagging', false);
  end if;
  with due as (
    select e.id from private.qa_test_user_events e
    where e.occurred_at < statement_timestamp() - interval '2160 hours'
      and e.occurred_at < private.accounts_audit_cutoff(e.phase)
      and (e.operation_id is null or e.phase = 'denied' or exists
        (select from private.accounts_operations o where o.id = e.operation_id and o.state in ('success', 'failure')))
    order by e.occurred_at, e.id limit p_limit
  )
  delete from private.qa_test_user_events e using due where e.id = due.id;
  get diagnostics v_deleted = row_count;
  with abandoned as (
    select o.id from private.accounts_operations o
    where o.state in ('success', 'failure')
      and o.created_at < statement_timestamp() - interval '8760 hours' and not exists
      (select from private.qa_test_user_events e where e.operation_id = o.id)
    order by o.created_at, o.id limit (p_limit - v_deleted)
  )
  delete from private.accounts_operations o using abandoned where o.id = abandoned.id;
  get diagnostics v_operations = row_count;
  with expired as (
    select address_key from private.accounts_invite_window
      where admitted_at < statement_timestamp() - interval '48 hours'
      order by admitted_at, address_key limit (p_limit - v_deleted - v_operations)
      for update skip locked
  )
  delete from private.accounts_invite_window w using expired where w.address_key = expired.address_key;
  get diagnostics v_invites = row_count;
  select exists (select from private.qa_test_user_events e
    where e.occurred_at < statement_timestamp() - interval '2184 hours'
      and e.occurred_at < private.accounts_audit_cutoff(e.phase) - interval '24 hours'
      and (e.operation_id is null or e.phase = 'denied' or exists
        (select from private.accounts_operations o where o.id = e.operation_id and o.state in ('success', 'failure'))))
  into v_lag;
  return jsonb_build_object('fenced', false, 'deleted', v_deleted + v_operations + v_invites, 'lagging', v_lag);
end;
$$;
revoke all on function private.accounts_purge(integer) from public, anon, authenticated, service_role;
grant execute on function private.accounts_purge(integer) to service_role;
create function private.accounts_operation_status(p_operation uuid, p_actor uuid, p_credential uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_op private.accounts_operations := private.accounts_lock_operation(p_operation, p_actor, p_credential);
begin
  if p_credential is null and not private.accounts_human_allowed(p_actor) then
    raise exception 'Account authority refused' using errcode = '42501';
  end if;
  return jsonb_strip_nulls(jsonb_build_object('operationId', v_op.id, 'targetId', v_op.target_id,
    'status', case v_op.state when 'intent' then 'pending' when 'success' then 'completed' else v_op.state end));
end;
$$;
revoke all on function private.accounts_operation_status(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.accounts_operation_status(uuid, uuid, uuid) to service_role;

commit;
