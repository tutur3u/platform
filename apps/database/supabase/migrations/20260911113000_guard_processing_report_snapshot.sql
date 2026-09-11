-- The claim RPC locks the report before publishing delivery_status=processing.
-- Freeze its reviewable snapshot until the leased worker finishes. A concurrent
-- reviewer either changes approval before the claim, or receives a conflict;
-- approval cannot be revoked between the worker's final check and provider send.
create or replace function private.guard_processing_report_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.delivery_status = 'processing' then
    if tg_op = 'DELETE' then
      raise exception using errcode = '55P03',
        message = 'Report delivery is in progress. Try again after it finishes.';
    end if;
    if row(old.report_approval_status, old.title, old.content, old.feedback,
           old.score, old.scores, old.user_id, old.group_id, old.creator_id,
           old.approved_by, old.approved_at, old.rejected_by, old.rejected_at,
           old.rejection_reason)
       is distinct from
       row(new.report_approval_status, new.title, new.content, new.feedback,
           new.score, new.scores, new.user_id, new.group_id, new.creator_id,
           new.approved_by, new.approved_at, new.rejected_by, new.rejected_at,
           new.rejection_reason) then
      raise exception using errcode = '55P03',
        message = 'Report delivery is in progress. Try again after it finishes.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.guard_processing_report_snapshot() from public;
drop trigger if exists guard_processing_report_snapshot on private.external_user_monthly_reports;
create trigger guard_processing_report_snapshot
  before update or delete on private.external_user_monthly_reports
  for each row execute function private.guard_processing_report_snapshot();
