-- One non-cancelled GVNN schedule session per class slot (workspace, class,
-- date, start time).
--
-- The schedule editor and the month clone already skip slots that are taken,
-- so sequential saves, retries and re-clones never duplicate. Two requests
-- committed at the same instant could still each insert the same slot (and
-- each notify its teacher); this unique index closes that race. The editor
-- and clone catch its unique violation (23505) and treat the slot as taken.
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
  select count(*), string_agg(slot, E'\n' order by slot)
    into duplicate_slots, sample
  from (
    select format(
      'ws %s group %s %s %s: sessions %s',
      ws_id, group_id, session_date, start_time,
      array_to_string(array_agg(id order by created_at, id), ', ')
    ) as slot
    from private.topic_announcements
    where source_type = 'schedule'
      and status <> 'cancelled'
      and group_id is not null
      and session_date is not null
      and start_time is not null
    group by ws_id, group_id, session_date, start_time
    having count(*) > 1
    order by ws_id, group_id, session_date, start_time
    limit 50
  ) duplicates;

  if duplicate_slots > 0 then
    raise exception
      'topic schedule slot duplicates: % slot(s) hold more than one non-cancelled session', duplicate_slots
      using
        detail = sample,
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

notify pgrst, 'reload schema';
