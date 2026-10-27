-- One non-cancelled GVNN schedule session per class slot (workspace, class,
-- date, start time).
--
-- The schedule editor and the month clone already skip slots that are taken,
-- so sequential saves, retries and re-clones never duplicate. Two requests
-- committed at the same instant could still each insert the same slot (and
-- each notify its teacher); this unique index closes that race. The editor
-- and clone catch its unique violation (23505) and treat the slot as taken.
--
-- The editor puts a session's previous GVNN back through
-- private.set_topic_schedule_recipient (below), one locked transaction.
--
-- The index needs the data to be clean. If any workspace already has two
-- non-cancelled schedule sessions in one slot, this migration STOPS with the
-- number of slots and their session ids. It never picks or cancels one: the
-- supervisor (or an authorized operator) cancels the extra sessions, then the
-- migration is re-applied. Find them first with
-- apps/database/verification/topic-schedule-slot-duplicates.sql (read-only).
--
-- private.topic_announcements is small (a few hundred schedule rows per
-- workspace and month), so a plain build under SHARE lock is brief; Supabase
-- migrations run in a transaction, so CONCURRENTLY is not available.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare
  duplicate_slots integer;
  sample text;
begin
  create temporary table topic_schedule_duplicate_slots on commit drop as
  select
    ws_id,
    group_id,
    session_date,
    start_time,
    array_agg(id order by created_at, id) as session_ids
  from private.topic_announcements
  where source_type = 'schedule'
    and status <> 'cancelled'
    and group_id is not null
    and session_date is not null
    and start_time is not null
  group by ws_id, group_id, session_date, start_time
  having count(*) > 1;

  -- Count every duplicate slot; list at most 50 of them.
  select count(*) into duplicate_slots from topic_schedule_duplicate_slots;

  if duplicate_slots > 0 then
    select string_agg(slot, E'\n' order by slot)
      into sample
    from (
      select format(
        'ws %s group %s %s %s: sessions %s',
        ws_id, group_id, session_date, start_time,
        array_to_string(session_ids, ', ')
      ) as slot
      from topic_schedule_duplicate_slots
      order by ws_id, group_id, session_date, start_time
      limit 50
    ) listed;

    raise exception
      'topic schedule slot duplicates: % slot(s) hold more than one non-cancelled session', duplicate_slots
      using
        detail = case
          when duplicate_slots > 50 then sample || E'\n(first 50 of ' || duplicate_slots || ' slots)'
          else sample
        end,
        hint = 'Cancel the extra sessions (see apps/database/verification/topic-schedule-slot-duplicates.sql), then re-apply. This migration never removes sessions.';
  end if;
end;
$$;

create unique index topic_announcements_schedule_slot_unique
  on private.topic_announcements (ws_id, group_id, session_date, start_time)
  where source_type = 'schedule'
    and status <> 'cancelled'
    and group_id is not null
    and session_date is not null
    and start_time is not null;

comment on index private.topic_announcements_schedule_slot_unique is
  'One non-cancelled GVNN schedule session per workspace, class, date and start time.';

-- Sets a schedule session's GVNN recipient in one transaction. Used to put
-- the previous GVNN back when an edit could not apply (for example, the slot
-- index refused it): the session row is locked FOR UPDATE, so a send's claim
-- (an UPDATE of that row from an editable status to processing) waits for
-- this to finish and then re-checks its condition; editability is re-checked
-- under the lock; the contact is checked (and locked against archiving) before
-- anything changes. Returns:
--   'set'                 the recipient is now p_contact_id (none when null);
--   'locked'              the session is in delivery or sent: nothing changed;
--   'contact_unavailable' the contact is archived or in another workspace:
--                         nothing changed (the current recipient stays);
--   'not_found'           no such schedule session in this workspace.
-- SECURITY INVOKER: only service_role may call it, with its own privileges.
create function private.set_topic_schedule_recipient(
  p_announcement_id uuid,
  p_ws_id uuid,
  p_contact_id uuid
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_status text;
  v_sent_at timestamptz;
begin
  select announcement.status, announcement.sent_at
    into v_status, v_sent_at
  from private.topic_announcements announcement
  where announcement.id = p_announcement_id
    and announcement.ws_id = p_ws_id
    and announcement.source_type = 'schedule'
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_sent_at is not null
    or v_status not in ('draft', 'failed', 'skipped') then
    return 'locked';
  end if;

  if p_contact_id is not null then
    perform 1
    from private.topic_announcement_contacts contact
    where contact.id = p_contact_id
      and contact.ws_id = p_ws_id
      and contact.archived = false
    for share;

    if not found then
      return 'contact_unavailable';
    end if;
  end if;

  delete from private.topic_announcement_recipients
  where announcement_id = p_announcement_id;

  if p_contact_id is not null then
    insert into private.topic_announcement_recipients (announcement_id, contact_id)
    values (p_announcement_id, p_contact_id);
  end if;

  return 'set';
end;
$fn$;

comment on function private.set_topic_schedule_recipient(uuid, uuid, uuid) is
  'Atomically sets a schedule session GVNN recipient while the session is editable (locks the session row).';

revoke all on function private.set_topic_schedule_recipient(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.set_topic_schedule_recipient(uuid, uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';
