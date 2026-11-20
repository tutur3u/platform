begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Complete owner-run definitions of the QA test user routines and the staff
-- identity verifier with search_path pinned to pg_catalog, pg_temp and explicit
-- ACLs. Bodies are unchanged; every table and helper is schema-qualified.
-- Ledger RPCs are executable only by service_role; the trigger functions,
-- internal helpers and the staff verifier by no client or service role.
-- tuturuuu: no-grant (internal)

create or replace function private.qa_test_marker_matches(p_meta jsonb, p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_user private.qa_test_users%rowtype;
  v_expires timestamptz;
begin
  select * into v_user from private.qa_test_users where user_id = p_user_id;
  if v_user.user_id is null then
    return false;
  end if;
  begin
    v_expires := (p_meta ->> 'qa_expires_at')::timestamptz;
  exception when others then
    return false;
  end;
  return coalesce(p_meta -> 'qa_test' = 'true'::jsonb
    and p_meta ->> 'qa_run' = v_user.run_id
    and p_meta -> 'qa_staff' = pg_catalog.to_jsonb(v_user.staff)
    and v_expires = (select r.expires_at from private.qa_test_runs r where r.id = v_user.run_id), false);
end;
$$;
revoke all on function private.qa_test_marker_matches(jsonb, uuid) from public, anon, authenticated, service_role;

create or replace function private.guard_qa_test_auth()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_user private.qa_test_users%rowtype;
  v_reserved boolean := private.is_qa_test_address(new.email)
    or coalesce(new.raw_app_meta_data, '{}'::jsonb) ? 'qa_test';
  v_old_marker jsonb;
  v_new_marker jsonb := private.qa_test_marker(new.raw_app_meta_data);
begin
  if tg_op = 'UPDATE' then
    select * into v_user from private.qa_test_users where user_id = old.id;
    v_old_marker := private.qa_test_marker(old.raw_app_meta_data);
    if v_old_marker <> '{}'::jsonb or v_user.user_id is not null then
      if new.id is distinct from old.id or new.email is distinct from old.email
        or coalesce(nullif(new.role, ''), 'authenticated') <> 'authenticated'
        or (v_new_marker is distinct from v_old_marker and not (
          v_old_marker = '{}'::jsonb and v_user.state = 'pending'
          and private.qa_test_marker_matches(new.raw_app_meta_data, old.id)))
      then
        raise exception 'QA test account scope cannot change' using errcode = '42501';
      end if;
      return new;
    end if;
    if v_reserved then
      raise exception 'QA test marker is reserved' using errcode = '42501';
    end if;
    return new;
  end if;

  select * into v_user from private.qa_test_users where user_id = new.id;
  if v_user.user_id is null then
    if v_reserved then
      raise exception 'QA test address is reserved' using errcode = '42501';
    end if;
    return new;
  end if;
  if v_user.state <> 'pending'
    or coalesce(nullif(new.role, ''), 'authenticated') <> 'authenticated'
    or pg_catalog.lower(new.email) is distinct from v_user.email
    or not (v_new_marker = '{}'::jsonb
      or private.qa_test_marker_matches(new.raw_app_meta_data, new.id))
  then
    raise exception 'QA test account does not match its reservation' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_qa_test_auth() from public, anon, authenticated, service_role;

create or replace function private.guard_qa_test_privilege()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if not exists (select from private.qa_test_users where user_id = new.user_id) then
    return new;
  end if;
  -- Nested checks: PL/pgSQL resolves every NEW field in one expression.
  if tg_table_name = 'workspace_members' then
    if new.ws_id = '00000000-0000-0000-0000-000000000000'::uuid then
      raise exception 'QA test accounts cannot join the root workspace' using errcode = '42501';
    end if;
  elsif new.enabled or new.allow_challenge_management
    or new.allow_manage_all_challenges or new.allow_role_management
    or new.allow_workspace_creation or new.allow_discord_integrations then
    raise exception 'QA test accounts cannot hold platform roles' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_qa_test_privilege() from public, anon, authenticated, service_role;

create or replace function private.qa_test_grant_tier(p_run_id text, p_ws_id uuid, p_user_id uuid, p_tier public.workspace_product_tier)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_product record;
  v_run private.qa_test_runs%rowtype;
  v_id uuid := gen_random_uuid();
begin
  select * into v_run from private.qa_test_runs where id = p_run_id;
  select id, pricing_model into v_product from private.workspace_subscription_products
  where tier = p_tier and not archived
  order by (pricing_model = 'seat_based'), price nulls last, id limit 1;
  if v_product.id is null then
    raise exception 'No subscription product for tier %', p_tier using errcode = '22023';
  end if;
  insert into public.workspace_subscriptions (id, ws_id, product_id, polar_subscription_id, status,
    current_period_start, current_period_end, cancel_at_period_end, seat_count)
  values (v_id, p_ws_id, v_product.id, 'qa_test_' || v_id::text, 'active', clock_timestamp(),
    v_run.expires_at, true, case when v_product.pricing_model = 'seat_based' then 200 end);
  insert into private.qa_test_subscriptions (subscription_id, run_id, ws_id, user_id, tier)
  values (v_id, p_run_id, p_ws_id, p_user_id, p_tier);
  return v_id;
end;
$$;
revoke all on function private.qa_test_grant_tier(text, uuid, uuid, public.workspace_product_tier) from public, anon, authenticated, service_role;

create or replace function private.qa_test_reserve_users(
  p_operator uuid, p_run_id text, p_purpose text, p_ttl_seconds integer,
  p_count integer, p_staff boolean, p_tier text, p_workspace boolean
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_run private.qa_test_runs%rowtype;
  v_next integer;
  v_email text;
  v_id uuid;
  v_users jsonb := '[]'::jsonb;
begin
  if not (select provisioning_enabled from private.qa_test_user_control) then
    raise exception 'QA test user provisioning is disabled' using errcode = '55000';
  end if;
  if p_operator is null or p_count is null or p_count not between 1 and 50
    or p_tier is null or p_tier not in ('FREE', 'PLUS', 'PRO') then
    raise exception 'Invalid QA test user request' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(7903150602);
  if (select count(*) from private.qa_test_users where state <> 'deleted') + p_count > 300
    or (select count(*) from private.qa_test_users where created_at > clock_timestamp() - interval '24 hours') + p_count > 600
  then
    raise exception 'QA test user limit reached' using errcode = '54000';
  end if;

  if p_run_id is null then
    if p_ttl_seconds is null or p_ttl_seconds not between 900 and 259200 then
      raise exception 'Invalid QA test user request' using errcode = '22023';
    end if;
    insert into private.qa_test_runs (id, purpose, operator_user_id, workspace_requested, expires_at)
    values (pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 8), p_purpose,
      p_operator, coalesce(p_workspace, false), clock_timestamp() + pg_catalog.make_interval(secs => p_ttl_seconds))
    returning * into v_run;
  else
    select * into v_run from private.qa_test_runs where id = p_run_id for update;
    if v_run.id is null or v_run.operator_user_id <> p_operator
      or v_run.expires_at < clock_timestamp() + interval '10 minutes' then
      raise exception 'QA test run is unavailable' using errcode = '42501';
    end if;
    if coalesce(p_workspace, false) and not v_run.workspace_requested then
      update private.qa_test_runs set workspace_requested = true where id = v_run.id returning * into v_run;
    end if;
  end if;

  if (select count(*) from private.qa_test_users where run_id = v_run.id) + p_count > 200
    or (p_staff and (select count(*) from private.qa_test_users where run_id = v_run.id and staff) + p_count > 5)
  then
    raise exception 'QA test run limit reached' using errcode = '54000';
  end if;
  select coalesce(max(ordinal), 0) into v_next from private.qa_test_users where run_id = v_run.id;

  for i in 1..p_count loop
    v_id := gen_random_uuid();
    v_email := 'qa+' || v_run.id || '-' || (v_next + i)::text || '@'
      || case when p_staff then 'tuturuuu.com' else 'tutur3u.com' end;
    if exists (select from auth.users where id = v_id or pg_catalog.lower(email) = v_email)
      or exists (select from public.users where id = v_id)
      or exists (select from public.platform_email_roles where pg_catalog.lower(email) = v_email) then
      raise exception 'QA test address is already in use' using errcode = '23505';
    end if;
    insert into private.qa_test_users (user_id, run_id, ordinal, email, staff, tier)
    values (v_id, v_run.id, v_next + i, v_email, p_staff, p_tier::public.workspace_product_tier);
    v_users := v_users || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'userId', v_id, 'email', v_email, 'ordinal', v_next + i, 'staff', p_staff, 'tier', p_tier));
  end loop;

  return pg_catalog.jsonb_build_object('runId', v_run.id, 'purpose', v_run.purpose,
    'expiresAt', v_run.expires_at, 'users', v_users);
end;
$$;
revoke all on function private.qa_test_reserve_users(uuid, text, text, integer, integer, boolean, text, boolean) from public, anon, authenticated, service_role;
grant execute on function private.qa_test_reserve_users(uuid, text, text, integer, integer, boolean, text, boolean) to service_role;

create or replace function private.qa_test_activate_user(p_user_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_user private.qa_test_users%rowtype;
  v_run private.qa_test_runs%rowtype;
  v_personal uuid;
  v_workspace uuid;
  v_ws_tier integer;
begin
  select * into v_user from private.qa_test_users where user_id = p_user_id for update;
  if v_user.user_id is null or v_user.state <> 'pending' or not exists (
    select from auth.users where id = p_user_id and pg_catalog.lower(email) = v_user.email
      and raw_app_meta_data -> 'qa_test' = 'true'::jsonb and raw_app_meta_data ->> 'qa_run' = v_user.run_id
  ) then
    return null;
  end if;
  select * into v_run from private.qa_test_runs where id = v_user.run_id for update;

  select id into v_personal from public.workspaces
  where creator_id = p_user_id and personal and deleted is not true limit 1;
  if v_user.tier <> 'FREE' and v_personal is not null then
    perform private.qa_test_grant_tier(v_run.id, v_personal, p_user_id, v_user.tier);
  end if;

  if v_run.workspace_requested and v_run.workspace_deleted_at is null then
    if v_run.workspace_id is null then
      insert into public.workspaces (name, personal, creator_id)
      values ('[QA] ' || v_run.purpose || ' ' || v_run.id, false, p_user_id)
      returning id into v_workspace;
      update private.qa_test_runs set workspace_id = v_workspace where id = v_run.id
      returning * into v_run;
      insert into private.qa_test_user_events (action, actor, actor_user_id, run_id, user_id, detail)
      values ('workspace_create', 'operator', p_actor, v_run.id, p_user_id,
        pg_catalog.jsonb_build_object('workspaceId', v_run.workspace_id));
    end if;
    insert into public.workspace_members (ws_id, user_id) values (v_run.workspace_id, p_user_id)
    on conflict do nothing;
    select coalesce(max(private.qa_test_tier_rank(tier)), 0) into v_ws_tier
    from private.qa_test_subscriptions where ws_id = v_run.workspace_id and canceled_at is null;
    if private.qa_test_tier_rank(v_user.tier) > v_ws_tier then
      perform private.qa_test_grant_tier(v_run.id, v_run.workspace_id, null, v_user.tier);
    end if;
  end if;

  update private.qa_test_users set state = 'active', activated_at = clock_timestamp() where user_id = p_user_id;
  insert into private.qa_test_user_events (action, actor, actor_user_id, run_id, user_id, detail)
  values ('create', 'operator', p_actor, v_run.id, p_user_id, pg_catalog.jsonb_build_object(
    'staff', v_user.staff, 'tier', v_user.tier, 'purpose', v_run.purpose, 'expiresAt', v_run.expires_at));
  return pg_catalog.jsonb_build_object('userId', p_user_id, 'personalWorkspaceId', v_personal,
    'runWorkspaceId', v_run.workspace_id);
end;
$$;
revoke all on function private.qa_test_activate_user(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.qa_test_activate_user(uuid, uuid) to service_role;

create or replace function private.qa_test_record_session(p_user_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_user private.qa_test_users%rowtype;
  v_expires timestamptz;
begin
  select * into v_user from private.qa_test_users where user_id = p_user_id;
  select r.expires_at into v_expires from private.qa_test_runs r where r.id = v_user.run_id;
  if v_user.user_id is null or v_user.state <> 'active' or v_expires <= clock_timestamp()
    or not exists (select from auth.users where id = p_user_id and pg_catalog.lower(email) = v_user.email
      and raw_app_meta_data -> 'qa_test' = 'true'::jsonb)
  then
    return null;
  end if;
  insert into private.qa_test_user_events (action, actor, actor_user_id, run_id, user_id)
  values ('session', 'operator', p_actor, v_user.run_id, p_user_id);
  return pg_catalog.jsonb_build_object('userId', p_user_id, 'email', v_user.email,
    'runId', v_user.run_id, 'expiresAt', v_expires);
end;
$$;
revoke all on function private.qa_test_record_session(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.qa_test_record_session(uuid, uuid) to service_role;

create or replace function private.qa_test_begin_delete(p_user_id uuid, p_actor text, p_actor_user uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_user private.qa_test_users%rowtype;
  v_run private.qa_test_runs%rowtype;
  v_auth record;
  v_workspace uuid;
begin
  if p_actor is null or p_actor not in ('operator', 'cron') then
    raise exception 'Invalid QA test actor' using errcode = '22023';
  end if;
  -- The cleanup stop fence also holds every scheduled deletion that has not
  -- started, not only the next listing.
  if p_actor = 'cron' and not coalesce((select cleanup_enabled from private.qa_test_user_control), false) then
    return pg_catalog.jsonb_build_object('state', 'fenced');
  end if;
  select * into v_user from private.qa_test_users where user_id = p_user_id for update;
  if v_user.user_id is null then
    return pg_catalog.jsonb_build_object('state', 'not_found');
  end if;
  if v_user.state = 'deleted' then
    return pg_catalog.jsonb_build_object('state', 'deleted');
  end if;
  if v_user.state = 'deleting' and v_user.lease_until > clock_timestamp() then
    return pg_catalog.jsonb_build_object('state', 'busy');
  end if;
  select id, email, raw_app_meta_data into v_auth from auth.users where id = p_user_id;
  -- An account Auth created but never marked (an interrupted create) still has
  -- its reserved address and was never activated, so it is removable too.
  if v_auth.id is not null and (pg_catalog.lower(v_auth.email) is distinct from v_user.email
    or not ((v_auth.raw_app_meta_data -> 'qa_test' = 'true'::jsonb
        and v_auth.raw_app_meta_data ->> 'qa_run' = v_user.run_id)
      or (private.qa_test_marker(v_auth.raw_app_meta_data) = '{}'::jsonb
        and v_user.activated_at is null))) then
    raise exception 'Refusing to delete an account without the QA test marker' using errcode = '42501';
  end if;

  update private.qa_test_users set state = 'deleting', lease_until = clock_timestamp() + interval '10 minutes'
  where user_id = p_user_id;
  select * into v_run from private.qa_test_runs where id = v_user.run_id for update;
  if v_run.workspace_id is not null and v_run.workspace_deleted_at is null and not exists (
    select from private.qa_test_users where run_id = v_run.id and user_id <> p_user_id and state in ('pending', 'active')
  ) then
    v_workspace := v_run.workspace_id;
  end if;

  update public.workspace_subscriptions s set status = 'canceled', updated_at = clock_timestamp()
  from private.qa_test_subscriptions q
  where q.subscription_id = s.id and s.polar_subscription_id like 'qa\_test\_%' and q.canceled_at is null
    and (q.user_id = p_user_id or q.ws_id = v_workspace);
  update private.qa_test_subscriptions set canceled_at = clock_timestamp()
  where canceled_at is null and (user_id = p_user_id or ws_id = v_workspace);

  return pg_catalog.jsonb_build_object('state', 'deleting', 'authPresent', v_auth.id is not null,
    'runId', v_user.run_id, 'runWorkspaceId', v_workspace);
end;
$$;
revoke all on function private.qa_test_begin_delete(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function private.qa_test_begin_delete(uuid, text, uuid) to service_role;

create or replace function private.qa_test_finish_delete(p_user_id uuid, p_actor text, p_actor_user uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_user private.qa_test_users%rowtype;
begin
  if p_actor is null or p_actor not in ('operator', 'cron') then
    raise exception 'Invalid QA test actor' using errcode = '22023';
  end if;
  select * into v_user from private.qa_test_users where user_id = p_user_id for update;
  if v_user.user_id is null or v_user.state <> 'deleting' then
    return pg_catalog.jsonb_build_object('state', coalesce(v_user.state, 'not_found'));
  end if;
  if exists (select from auth.users where id = p_user_id) then
    return pg_catalog.jsonb_build_object('state', 'present');
  end if;
  update private.qa_test_users set state = 'deleted', deleted_at = clock_timestamp(), lease_until = null
  where user_id = p_user_id;
  insert into private.qa_test_user_events (action, actor, actor_user_id, run_id, user_id, detail)
  values ('delete', p_actor, p_actor_user, v_user.run_id, p_user_id,
    pg_catalog.jsonb_build_object('staff', v_user.staff, 'tier', v_user.tier));
  return pg_catalog.jsonb_build_object('state', 'deleted');
end;
$$;
revoke all on function private.qa_test_finish_delete(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function private.qa_test_finish_delete(uuid, text, uuid) to service_role;

create or replace function private.qa_test_finish_workspace_delete(p_run_id text, p_actor text, p_actor_user uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_run private.qa_test_runs%rowtype;
begin
  if p_actor is null or p_actor not in ('operator', 'cron') then
    raise exception 'Invalid QA test actor' using errcode = '22023';
  end if;
  select * into v_run from private.qa_test_runs where id = p_run_id for update;
  if v_run.workspace_id is null or v_run.workspace_deleted_at is not null
    or exists (select from public.workspaces where id = v_run.workspace_id) then
    return false;
  end if;
  update private.qa_test_runs set workspace_deleted_at = clock_timestamp() where id = p_run_id;
  insert into private.qa_test_user_events (action, actor, actor_user_id, run_id, detail)
  values ('workspace_delete', p_actor, p_actor_user, p_run_id,
    pg_catalog.jsonb_build_object('workspaceId', v_run.workspace_id));
  return true;
end;
$$;
revoke all on function private.qa_test_finish_workspace_delete(text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function private.qa_test_finish_workspace_delete(text, text, uuid) to service_role;

create or replace function private.qa_test_list_expired(p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if p_limit is null or p_limit not between 1 and 25 then
    raise exception 'Invalid QA cleanup limit' using errcode = '22023';
  end if;
  if not (select cleanup_enabled from private.qa_test_user_control) then
    return pg_catalog.jsonb_build_object('mode', 'fenced', 'userIds', '[]'::jsonb);
  end if;
  return pg_catalog.jsonb_build_object('mode', 'run', 'userIds', coalesce((
    select pg_catalog.jsonb_agg(user_id) from (
      select u.user_id from private.qa_test_users u join private.qa_test_runs r on r.id = u.run_id
      where (u.state in ('pending', 'active') and r.expires_at <= clock_timestamp())
        or (u.state = 'deleting' and u.lease_until <= clock_timestamp())
      order by r.expires_at, u.ordinal
      limit p_limit
    ) due
  ), '[]'::jsonb));
end;
$$;
revoke all on function private.qa_test_list_expired(integer) from public, anon, authenticated, service_role;
grant execute on function private.qa_test_list_expired(integer) to service_role;

create or replace function private.qa_test_list_users(p_run_id text, p_include_deleted boolean)
returns jsonb language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'userId', u.user_id, 'email', u.email, 'runId', u.run_id, 'ordinal', u.ordinal,
    'staff', u.staff, 'tier', u.tier, 'state', u.state, 'purpose', r.purpose,
    'operatorUserId', r.operator_user_id, 'expiresAt', r.expires_at,
    'runWorkspaceId', case when r.workspace_deleted_at is null then r.workspace_id end,
    'createdAt', u.created_at, 'deletedAt', u.deleted_at
  ) order by r.created_at desc, u.ordinal), '[]'::jsonb)
  from (
    select * from private.qa_test_users
    where (p_run_id is null or run_id = p_run_id)
      and (coalesce(p_include_deleted, false) or state <> 'deleted')
    order by created_at desc limit 500
  ) u
  join private.qa_test_runs r on r.id = u.run_id
$$;
revoke all on function private.qa_test_list_users(text, boolean) from public, anon, authenticated, service_role;
grant execute on function private.qa_test_list_users(text, boolean) to service_role;

create or replace function private.staff_identity_verified(p_user_id uuid)
returns boolean
language sql
stable security definer
set search_path = pg_catalog, pg_temp
as $function$
  with tenant as (
    select nullif(pg_catalog.btrim(c.value), '') as id
    from private.security_config c
    where c.key = 'azure_staff_tenant_id'
  )
  select coalesce((
    select u.email_confirmed_at is not null
      and not (coalesce(u.raw_app_meta_data, '{}'::jsonb) ? 'qa_test')
      and not private.is_qa_test_address(u.email)
      and exists (select 1 from auth.identities any_identity where any_identity.user_id = u.id)
      and not exists (
        select 1
        from auth.identities i
        cross join lateral (
          select case when pg_catalog.jsonb_typeof(i.identity_data -> 'iss') = 'string'
            then pg_catalog.regexp_match(i.identity_data ->> 'iss',
              '^https://(?:login\.microsoftonline\.com/([^/]+)/v2\.0|sts\.windows\.net/([^/]+)/)$')
          end as m
        ) issuer
        where i.user_id = u.id
          and i.provider = 'azure'
          and not coalesce(
            (select t.id from tenant t) is not null
            and (case
              when coalesce(pg_catalog.jsonb_typeof(i.identity_data -> 'tid'), 'null') = 'null'
                then coalesce(issuer.m[1], issuer.m[2])
              when pg_catalog.jsonb_typeof(i.identity_data -> 'tid') = 'string'
                then i.identity_data ->> 'tid'
            end) = (select t.id from tenant t)
            and (not (i.identity_data ? 'iss')
              or coalesce(issuer.m[1], issuer.m[2]) = (select t.id from tenant t)),
            false
          )
      )
    from auth.users u
    where u.id = p_user_id
  ), false)
$function$;
revoke all on function private.staff_identity_verified(uuid) from public, anon, authenticated, service_role;

commit;
