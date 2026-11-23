-- Service-role functions for calendar invitation delivery: durable quotas,
-- leased claims and an atomic quota-checked enqueue. Tables are created in
-- 20261123115000_calendar_event_guests.sql.

-- ---------------------------------------------------------------------------
-- Durable send quota (service role). Counts the outbox, which is the durable
-- counter; returns the first exceeded limit or null.
-- ---------------------------------------------------------------------------

create or replace function private.calendar_invite_quota_check(
  p_ws_id uuid,
  p_requested_by uuid,
  p_new_recipients integer,
  p_user_daily_limit integer default 200,
  p_workspace_daily_limit integer default 1000,
  p_user_hourly_limit integer default 60
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user_day integer;
  v_user_hour integer;
  v_ws_day integer;
begin
  if exists (
    select 1 from private.calendar_invite_send_fences f
    where f.stopped and (f.ws_id is null or f.ws_id = p_ws_id)
  ) then
    return 'stopped';
  end if;

  select count(*) filter (where created_at > now() - interval '1 day'),
         count(*) filter (where created_at > now() - interval '1 hour')
  into v_user_day, v_user_hour
  from private.calendar_invite_deliveries
  where requested_by = p_requested_by
    and created_at > now() - interval '1 day'
    and status not in ('suppressed', 'throttled', 'cancelled');

  if v_user_hour + p_new_recipients > p_user_hourly_limit then
    return 'user_hourly';
  end if;

  if v_user_day + p_new_recipients > p_user_daily_limit then
    return 'user_daily';
  end if;

  select count(*) into v_ws_day
  from private.calendar_invite_deliveries
  where ws_id = p_ws_id
    and created_at > now() - interval '1 day'
    and status not in ('suppressed', 'throttled', 'cancelled');

  if v_ws_day + p_new_recipients > p_workspace_daily_limit then
    return 'workspace_daily';
  end if;

  return null;
end;
$$;

revoke all on function private.calendar_invite_quota_check(
  uuid, uuid, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function private.calendar_invite_quota_check(
  uuid, uuid, integer, integer, integer, integer
) to service_role;

-- Claim a bounded batch of due deliveries with a lease (service role).
create or replace function private.calendar_invite_claim_deliveries(
  p_limit integer default 25,
  p_lease_seconds integer default 120
)
returns setof private.calendar_invite_deliveries
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'claim limit out of range' using errcode = '22023';
  end if;

  -- A lease that expired mid-send may already have reached the provider.
  -- Settle it as unknown instead of sending a possible duplicate.
  update private.calendar_invite_deliveries
  set status = 'unknown',
      last_error = 'send lease expired',
      event_snapshot = case
        when event_snapshot ->> 'encrypted' = 'true' then '{}'::jsonb
        else event_snapshot
      end,
      lease_expires_at = null,
      updated_at = now()
  where status = 'sending'
    and lease_expires_at < now();

  return query
  update private.calendar_invite_deliveries d
  set status = 'sending',
      attempts = d.attempts + 1,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  where d.id in (
    select c.id
    from private.calendar_invite_deliveries c
    where c.status in ('queued', 'failed')
      and c.next_attempt_at <= now()
      and c.attempts < 5
      and not exists (
        select 1 from private.calendar_invite_send_fences f
        where f.stopped and (f.ws_id is null or f.ws_id = c.ws_id)
      )
    order by c.next_attempt_at
    limit p_limit
    for update skip locked
  )
  returning d.*;
end;
$$;

revoke all on function private.calendar_invite_claim_deliveries(integer, integer)
  from public, anon, authenticated;
grant execute on function private.calendar_invite_claim_deliveries(integer, integer)
  to service_role;

-- Check quotas and queue deliveries in one transaction. Advisory locks on
-- the requester and the workspace serialise concurrent requests, so
-- parallel sends cannot all pass the same quota snapshot (service role).
create or replace function private.calendar_invite_enqueue(
  p_ws_id uuid,
  p_requested_by uuid,
  p_rows jsonb,
  p_new_recipients integer,
  p_check_quota boolean,
  p_user_daily_limit integer default 200,
  p_workspace_daily_limit integer default 1000,
  p_user_hourly_limit integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_blocked text;
  v_rows jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 101 then
    raise exception 'invalid delivery batch' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_requested_by::text, 7312));
  perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text, 7313));

  if p_check_quota then
    v_blocked := private.calendar_invite_quota_check(
      p_ws_id, p_requested_by, p_new_recipients,
      p_user_daily_limit, p_workspace_daily_limit, p_user_hourly_limit
    );
    if v_blocked is not null then
      return jsonb_build_object('blocked', v_blocked, 'rows', '[]'::jsonb);
    end if;
  end if;

  with inserted as (
    insert into private.calendar_invite_deliveries (
      ws_id, event_id, guest_id, recipient_email, method, kind,
      ical_sequence, idempotency_key, requested_by, event_snapshot, status
    )
    select p_ws_id, r.event_id, r.guest_id, r.recipient_email, r.method,
           r.kind, r.ical_sequence, r.idempotency_key, p_requested_by,
           case
             when r.status <> 'queued'
               and r.event_snapshot ->> 'encrypted' = 'true'
               then '{}'::jsonb
             else r.event_snapshot
           end,
           r.status
    from jsonb_to_recordset(p_rows) as r (
      event_id uuid, guest_id uuid, recipient_email text, method text,
      kind text, ical_sequence integer, idempotency_key text,
      event_snapshot jsonb, status text
    )
    where r.status in ('queued', 'suppressed', 'throttled')
    on conflict (idempotency_key) do nothing
    returning id, guest_id, status
  )
  select coalesce(jsonb_agg(to_jsonb(inserted)), '[]'::jsonb)
  into v_rows
  from inserted;

  return jsonb_build_object('blocked', null, 'rows', v_rows);
end;
$$;

revoke all on function private.calendar_invite_enqueue(
  uuid, uuid, jsonb, integer, boolean, integer, integer, integer
) from public, anon, authenticated;
grant execute on function private.calendar_invite_enqueue(
  uuid, uuid, jsonb, integer, boolean, integer, integer, integer
) to service_role;
