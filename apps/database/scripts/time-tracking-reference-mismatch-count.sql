-- READ ONLY: counts existing time tracking rows whose references cross a
-- workspace (or, for linked sessions, user) boundary. Run as a read-only role
-- against the target database after the guard migration
-- 20261029100400_guard_time_tracking_reference_workspaces.sql is applied; the
-- guards only cover new writes, so existing mismatches are only counted here.
-- No row content, ids or user data are returned and nothing is modified.
begin read only;

select 'requests.category_id' as reference, r.approval_status::text as approval_status, count(*) as mismatches
from private.time_tracking_requests as r
join public.time_tracking_categories as c on c.id = r.category_id
where c.ws_id <> r.workspace_id
group by r.approval_status

union all

select 'requests.task_id', r.approval_status::text, count(*)
from private.time_tracking_requests as r
join public.tasks as t on t.id = r.task_id
join public.task_lists as l on l.id = t.list_id
join public.workspace_boards as b on b.id = l.board_id
where b.ws_id <> r.workspace_id
group by r.approval_status

union all

select 'requests.linked_session_id', r.approval_status::text, count(*)
from private.time_tracking_requests as r
join public.time_tracking_sessions as s on s.id = r.linked_session_id
where s.ws_id <> r.workspace_id
  or s.user_id <> r.user_id
group by r.approval_status

union all

select 'sessions.category_id', 'n/a', count(*)
from public.time_tracking_sessions as s
join public.time_tracking_categories as c on c.id = s.category_id
where c.ws_id <> s.ws_id
having count(*) > 0

order by 1, 2;

rollback;
