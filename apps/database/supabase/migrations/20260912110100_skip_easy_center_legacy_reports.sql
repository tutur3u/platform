-- User-authorized cleanup: Easy Center only, strictly before midnight GMT+7.
-- Keep report contents, approvals, and delivery history intact.
create or replace function private.skip_unsent_periodic_reports_before(
  p_ws_id uuid, p_created_before timestamptz
) returns integer language plpgsql security definer set search_path = '' as $$
declare skipped_count integer;
begin
  update private.external_user_monthly_reports report
  set delivery_status = 'skipped',
      last_delivery_error = 'Skipped: legacy unsent report before ' || p_created_before::text,
      updated_at = now()
  from public.workspace_users subject
  where subject.id = report.user_id
    and subject.ws_id = p_ws_id
    and report.created_at < p_created_before
    and report.delivery_status = 'draft'
    and report.delivered_at is null
    and not exists (
      select 1 from private.user_report_email_queue queue
      where queue.report_id = report.id
        and (queue.status in ('queued', 'processing')
          or (queue.delivery_kind = 'send' and (queue.sent_at is not null or queue.status = 'sent')))
    );
  get diagnostics skipped_count = row_count;
  return skipped_count;
end;
$$;

revoke all on function private.skip_unsent_periodic_reports_before(uuid,timestamptz) from public, anon, authenticated;
grant execute on function private.skip_unsent_periodic_reports_before(uuid,timestamptz) to service_role;

do $$
declare skipped_count integer;
begin
  skipped_count := private.skip_unsent_periodic_reports_before(
    '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid,
    timestamptz '2026-09-12 00:00:00+07'
  );
  raise notice 'Skipped % Easy Center reports created before 2026-09-12 00:00 GMT+7', skipped_count;
end;
$$;
