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
-- The concurrent build is in the next single-statement migration.
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
