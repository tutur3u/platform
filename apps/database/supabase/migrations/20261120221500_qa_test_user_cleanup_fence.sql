begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Scheduled QA test user deletions check the cleanup stop fence when each
-- deletion begins, so pausing cleanup also halts a slot already in progress.
-- Operator deletions are unaffected.

create or replace function private.qa_test_begin_delete(p_user_id uuid, p_actor text, p_actor_user uuid)
returns jsonb language plpgsql security definer set search_path = ''
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

commit;
