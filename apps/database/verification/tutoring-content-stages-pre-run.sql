-- Run BEFORE the stage migration. Counts only; no receipt or workspace IDs.
-- The predicate matches the backfill and the processor's excluded identity.
begin read only;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
with population as (
  select md5(g.ws_id::text) = 'c736c4be0acb08f8625bb5ebe9ad8fe2' as is_ec
  from private.tutoring_notification_receipts r
  join public.workspace_user_groups g on g.id=r.group_id
  where r.kind='weak_content_review_due'
), segments(is_ec, workspace_segment) as (
  values (true, 'EC'), (false, 'non-EC')
)
select s.workspace_segment,
  count(p.is_ec) as legacy_receipts,
  count(*) filter (where p.is_ec=false) as would_change
from segments s left join population p on p.is_ec=s.is_ec
group by s.workspace_segment
order by s.workspace_segment;
commit;
