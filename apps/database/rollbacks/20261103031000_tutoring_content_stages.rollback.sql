-- Run standalone: phase 1 commits disablement independently of backup or collisions.
-- Pax must disable the Cron Control job before running this file.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
drop trigger if exists reset_tutoring_content_clock on public.user_feedbacks;
drop function if exists private.reset_tutoring_content_clock();
drop function if exists private.process_tutoring_content_rules(integer);
commit;

-- Preserve both live stage history and a private backup. No schema contraction:
-- the stage column, scan cursor and review-episode tables are retained inert.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create table if not exists private.tutoring_content_stage_backup
  (like private.tutoring_notification_receipts including defaults);
alter table private.tutoring_content_stage_backup enable row level security;
revoke all on private.tutoring_content_stage_backup from public, anon, authenticated;
insert into private.tutoring_content_stage_backup
select r.* from private.tutoring_notification_receipts r
where not exists(select 1 from private.tutoring_content_stage_backup b where b.id=r.id);
commit;

-- Diagnostic precheck only; collisions never prevent committed disablement.
select group_id, student_user_id, review_cycle_started_at, recipient_user_id, count(*)
from private.tutoring_notification_receipts
 group by group_id, student_user_id, review_cycle_started_at, recipient_user_id
having count(*) > 1;
-- Optional contraction requires a separate owner-authorized reconciliation,
-- verified backup and a repeated collision precheck. Retain stage schema here.
