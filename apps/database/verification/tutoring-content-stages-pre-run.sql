-- Run BEFORE the stage migration. Counts only; no receipt or workspace IDs.
-- The predicate matches the backfill's client-workspace exclusion (MD5 of its ID).
begin read only;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
with population as (
  select md5(g.ws_id::text) = 'c736c4be0acb08f8625bb5ebe9ad8fe2' as is_excluded
  from private.tutoring_notification_receipts r
  join public.workspace_user_groups g on g.id=r.group_id
  where r.kind='weak_content_review_due'
), segments(is_excluded, workspace_segment) as (
  values (true, 'excluded'), (false, 'other')
)
select s.workspace_segment,
  count(p.is_excluded) as legacy_receipts,
  count(*) filter (where p.is_excluded=false) as would_change
from segments s left join population p on p.is_excluded=s.is_excluded
group by s.workspace_segment
order by s.workspace_segment;
commit;
