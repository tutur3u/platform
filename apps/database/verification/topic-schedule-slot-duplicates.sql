-- Read-only pre-check for 20261027010100_topic_schedule_slot_unique.sql.
-- Lists every slot (workspace, class, date, start time) holding more than
-- one non-cancelled schedule session. The migration stops while any row is
-- returned. Run in the rehearsal and before the production apply; report the
-- count and the session ids, and never cancel sessions from this script.
select
  ws_id,
  group_id,
  session_date,
  start_time,
  count(*) as sessions,
  array_agg(id order by created_at, id) as session_ids,
  array_agg(status order by created_at, id) as statuses
from private.topic_announcements
where source_type = 'schedule'
  and status <> 'cancelled'
  and group_id is not null
  and session_date is not null
  and start_time is not null
group by ws_id, group_id, session_date, start_time
having count(*) > 1
order by ws_id, group_id, session_date, start_time;
