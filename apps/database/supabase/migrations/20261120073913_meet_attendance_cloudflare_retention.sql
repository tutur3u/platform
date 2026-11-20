begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Cloudflare Cron Control owns attendance retention. The stop fence starts
-- closed. service_role can read it and call the functions; it cannot open it.
create table private.meet_attendance_retention_control (
  id boolean primary key default true check (id),
  stopped boolean not null default true
);

comment on table private.meet_attendance_retention_control is
  'Singleton stop fence for Cloudflare attendance retention. Closed until the database owner opens it.';

insert into private.meet_attendance_retention_control (id) values (true);

alter table private.meet_attendance_retention_control enable row level security;
revoke all on table private.meet_attendance_retention_control
  from public, anon, authenticated, service_role;
grant select on table private.meet_attendance_retention_control to service_role;

create policy meet_attendance_retention_control_service_read
  on private.meet_attendance_retention_control
  for select
  to service_role
  using (true);

-- One call deletes at most p_limit sessions older than 90 days. A closed
-- fence deletes nothing. Repeating the call continues from the rows that remain.
drop function if exists private.purge_expired_meet_attendance(timestamptz);

create function private.purge_expired_meet_attendance(
  p_now timestamptz default pg_catalog.now(),
  p_limit integer default 200
) returns integer
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  retention_stopped boolean;
  removed integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'p_limit must be between 1 and 200' using errcode = '22023';
  end if;

  select control.stopped
  into retention_stopped
  from private.meet_attendance_retention_control as control
  where control.id;

  if coalesce(retention_stopped, true) then
    return 0;
  end if;

  delete from private.meet_attendance_sessions as sessions
  where sessions.id in (
    select expired.id
    from private.meet_attendance_sessions as expired
    where expired.joined_at < p_now - interval '90 days'
    order by expired.joined_at, expired.id
    limit p_limit
  );
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function private.purge_expired_meet_attendance(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function private.purge_expired_meet_attendance(timestamptz, integer)
  to service_role;

-- One page of confirmed erasure intents. Session deletes repeat safely.
-- The pending row is removed only when session work is already done and
-- every room acknowledgement is stored on the plan.
create function private.advance_meet_attendance_erasure_intents(
  p_limit integer default 32
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  retention_stopped boolean;
  intent_row record;
  intent_plan jsonb;
  claim_keys jsonb;
  intent_settled boolean;
  subject_user uuid;
  subject_guest uuid;
  intents_advanced integer := 0;
  intents_finished integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 32 then
    raise exception 'p_limit must be between 1 and 32' using errcode = '22023';
  end if;

  select control.stopped
  into retention_stopped
  from private.meet_attendance_retention_control as control
  where control.id;

  if coalesce(retention_stopped, true) then
    return pg_catalog.jsonb_build_object(
      'state', 'fenced',
      'advanced', 0,
      'finished', 0
    );
  end if;

  for intent_row in
    select pending.kind, pending.subject_key, pending.plan
    from private.meet_attendance_pending_erasures as pending
    where pending.plan->>'phase' = 'confirmed'
    order by
      coalesce(pending.plan->>'maintenanceAt', ''),
      pending.created_at,
      pending.kind,
      pending.subject_key
    limit p_limit
    for update skip locked
  loop
    intent_plan := intent_row.plan;
    subject_user := null;
    subject_guest := null;

    if intent_plan->'sql'->>'op' = 'meeting'
      and intent_plan->'sql'->>'meetingId' ~* '^[0-9a-f-]{36}$'
    then
      delete from private.meet_attendance_sessions as sessions
      where sessions.meeting_id = (intent_plan->'sql'->>'meetingId')::uuid;
    elsif intent_plan->'sql'->>'op' = 'workspace'
      and intent_plan->'sql'->>'wsId' ~* '^[0-9a-f-]{36}$'
    then
      delete from private.meet_attendance_sessions as sessions
      where sessions.ws_id = (intent_plan->'sql'->>'wsId')::uuid;
    elsif intent_plan->'sql'->>'op' = 'subject' then
      if intent_plan->'sql'->>'userId' ~* '^[0-9a-f-]{36}$' then
        subject_user := (intent_plan->'sql'->>'userId')::uuid;
      end if;
      if intent_plan->'sql'->>'guestId' ~* '^[0-9a-f-]{36}$' then
        subject_guest := (intent_plan->'sql'->>'guestId')::uuid;
      end if;
      if subject_user is not null or subject_guest is not null then
        delete from private.meet_attendance_sessions as sessions
        where (subject_user is not null and sessions.user_id = subject_user)
          or (subject_user is not null and sessions.guest_id = subject_user)
          or (subject_guest is not null and sessions.guest_id = subject_guest);
      end if;
    end if;

    claim_keys := '[]'::jsonb;
    if intent_plan->'sql'->>'op' in ('meeting', 'workspace') then
      claim_keys := jsonb_build_array('meeting');
    elsif intent_plan->'sql'->>'op' = 'subject' then
      if subject_user is not null then
        claim_keys := claim_keys || jsonb_build_array(
          'user:' || (intent_plan->'sql'->>'userId'),
          'guest:' || (intent_plan->'sql'->>'userId')
        );
      end if;
      if subject_guest is not null then
        claim_keys := claim_keys || jsonb_build_array(
          'guest:' || (intent_plan->'sql'->>'guestId')
        );
      end if;
    end if;

    intent_settled :=
      coalesce(intent_plan->>'sqlDone', '') = 'true'
      and jsonb_typeof(intent_plan->'rooms') = 'array'
      and not exists (
        select 1
        from jsonb_array_elements(intent_plan->'rooms') as room
        where exists (
          select 1
          from jsonb_array_elements_text(claim_keys) as claim_list(claim_key)
          where not jsonb_exists(
            coalesce(room->'posted', '[]'::jsonb),
            claim_list.claim_key
          )
        )
      );

    if intent_settled then
      delete from private.meet_attendance_pending_erasures as pending
      where pending.kind = intent_row.kind
        and pending.subject_key = intent_row.subject_key;
      intents_finished := intents_finished + 1;
    else
      update private.meet_attendance_pending_erasures as pending
      set plan = jsonb_set(
        pending.plan,
        '{maintenanceAt}',
        to_jsonb(pg_catalog.clock_timestamp()),
        true
      )
      where pending.kind = intent_row.kind
        and pending.subject_key = intent_row.subject_key;
    end if;
    intents_advanced := intents_advanced + 1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'state', 'open',
    'advanced', intents_advanced,
    'finished', intents_finished
  );
end;
$$;

revoke all on function private.advance_meet_attendance_erasure_intents(integer)
  from public, anon, authenticated;
grant execute on function private.advance_meet_attendance_erasure_intents(integer)
  to service_role;

notify pgrst, 'reload schema';
commit;
