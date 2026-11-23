-- tuturuuu: no-grant(trigger)
-- Hardening for calendar invitations: indexes for the outbox and foreign
-- keys, stricter suppression scopes, unsubscribe tokens that outlive their
-- workspace, input guards on the delivery functions, and a guest cap that
-- also covers re-adds and event moves.

set local lock_timeout = '5s';

create index if not exists calendar_invite_deliveries_guest_idx
  on private.calendar_invite_deliveries (guest_id, created_at desc)
  where guest_id is not null;
create index if not exists calendar_invite_deliveries_lease_idx
  on private.calendar_invite_deliveries (lease_expires_at)
  where status = 'sending';

create index if not exists calendar_invite_tokens_ws_idx
  on private.calendar_invite_tokens (ws_id) where ws_id is not null;
create index if not exists calendar_invite_tokens_sender_idx
  on private.calendar_invite_tokens (sender_user_id)
  where sender_user_id is not null;
create index if not exists calendar_invite_suppressions_sender_idx
  on private.calendar_invite_suppressions (sender_user_id)
  where sender_user_id is not null;
create index if not exists calendar_invite_suppressions_ws_idx
  on private.calendar_invite_suppressions (ws_id) where ws_id is not null;
create index if not exists calendar_event_guests_contact_idx
  on private.calendar_event_guests (contact_id) where contact_id is not null;
create index if not exists calendar_event_guests_invited_by_idx
  on private.calendar_event_guests (invited_by) where invited_by is not null;
create index if not exists calendar_event_invitation_settings_organizer_idx
  on private.calendar_event_invitation_settings (organizer_user_id)
  where organizer_user_id is not null;
create index if not exists calendar_invite_audit_actor_idx
  on private.calendar_invite_audit (actor_user_id)
  where actor_user_id is not null;
create index if not exists calendar_invite_send_fences_created_by_idx
  on private.calendar_invite_send_fences (created_by)
  where created_by is not null;

-- Each scope carries exactly its own key, so deleting an unrelated user or
-- workspace can never remove a recipient's suppression.
alter table private.calendar_invite_suppressions
  drop constraint if exists calendar_invite_suppressions_check;
alter table private.calendar_invite_suppressions
  drop constraint if exists calendar_invite_suppressions_scope_keys;
alter table private.calendar_invite_suppressions
  add constraint calendar_invite_suppressions_scope_keys check (
    (scope = 'all' and sender_user_id is null and ws_id is null)
    or (scope = 'sender' and sender_user_id is not null and ws_id is null)
    or (scope = 'workspace' and ws_id is not null and sender_user_id is null)
  );

-- Unsubscribe links keep working after their workspace is deleted.
alter table private.calendar_invite_tokens
  drop constraint if exists calendar_invite_tokens_ws_id_fkey;
alter table private.calendar_invite_tokens
  add constraint calendar_invite_tokens_ws_id_fkey
  foreign key (ws_id) references public.workspaces (id) on delete set null;

-- The cap ignores re-adds of an existing guest and also guards event moves.
create or replace function private.calendar_guest_cap()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.event_id::text, 7311));

  if exists (
    select 1 from private.calendar_event_guests
    where event_id = new.event_id
      and email = new.email
      and id is distinct from new.id
  ) then
    return new;
  end if;

  select count(*) into v_count
  from private.calendar_event_guests
  where event_id = new.event_id
    and id is distinct from new.id;

  if v_count >= 100 then
    raise exception 'calendar event guest limit reached'
      using errcode = '23514', hint = 'calendar_guest_limit';
  end if;

  return new;
end;
$$;

revoke all on function private.calendar_guest_cap()
  from public, anon, authenticated;

drop trigger if exists calendar_event_guests_cap on private.calendar_event_guests;
create trigger calendar_event_guests_cap
  before insert or update of event_id on private.calendar_event_guests
  for each row execute function private.calendar_guest_cap();

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
  if p_limit is null or p_limit not between 1 and 100
    or p_lease_seconds is null or p_lease_seconds not between 30 and 900 then
    raise exception 'claim arguments out of range' using errcode = '22023';
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
  v_queued integer;
begin
  if p_ws_id is null or p_requested_by is null or p_check_quota is null
    or p_rows is null or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) > 101 then
    raise exception 'invalid delivery batch' using errcode = '22023';
  end if;

  -- Every row must belong to an event and guest of this workspace.
  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as r (event_id uuid, guest_id uuid)
    where r.event_id is null
      or not exists (
        select 1 from public.workspace_calendar_events e
        where e.id = r.event_id and e.ws_id = p_ws_id
      )
      or (
        r.guest_id is not null
        and not exists (
          select 1 from private.calendar_event_guests g
          where g.id = r.guest_id and g.event_id = r.event_id
        )
      )
  ) then
    raise exception 'delivery batch does not match the workspace'
      using errcode = '22023';
  end if;

  -- Count the queued non-cancel rows here; the caller's count can only
  -- raise it, so an under-reported batch still meets the quota.
  select count(*) into v_queued
  from jsonb_to_recordset(p_rows) as r (status text, kind text)
  where r.status = 'queued' and r.kind is distinct from 'cancel';

  perform pg_advisory_xact_lock(hashtextextended(p_requested_by::text, 7312));
  perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text, 7313));

  if p_check_quota then
    v_blocked := private.calendar_invite_quota_check(
      p_ws_id, p_requested_by,
      greatest(coalesce(p_new_recipients, 0), v_queued),
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
