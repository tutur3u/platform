BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Admin "Resend" for periodic reports that failed, are stuck in the queue, or
-- were approved but never sent. It widens three checks on the audit table from
-- 20261104120000, adds one service-role function, and aligns the held Send now
-- and Skip checks with the app's held rule (no recorded delivery error). It
-- reads or changes no report, queue or config row, and queues nothing by
-- itself.
alter table private.periodic_report_held_actions
  drop constraint if exists periodic_report_held_actions_action_check,
  add constraint periodic_report_held_actions_action_check
    check (action in ('send', 'skip', 'resend'));

-- A resend may target a selection of reports instead of a period or class,
-- and a selection has no single cadence. Send and Skip keep both rules.
alter table private.periodic_report_held_actions
  alter column cadence drop not null;
alter table private.periodic_report_held_actions
  drop constraint if exists periodic_report_held_actions_scope_check,
  add constraint periodic_report_held_actions_scope_check
    check (action = 'resend' or period_start is not null or group_id is not null),
  add constraint periodic_report_held_actions_cadence_required
    check (action = 'resend' or cadence is not null);

comment on table private.periodic_report_held_actions is
  'Audited admin Send now / Skip choices for approved, never-sent periodic reports, and admin Resend of failed, stuck or approved-unsent reports. Service role only.';

-- Resend one report, only from the delivery state the admin confirmed, under
-- the report row lock. A report skipped, cancelled, sent, processing or
-- changed in any way since the count (delivery state or stage) is refused,
-- never queued. A test delivery is never resent: resend always requests a real
-- send, so a stuck or failed [TEST] email would otherwise reach the recipient
-- as the real report. A failed or blocked report is resent only for a
-- retryable error, the same rule as the app's Delivery failure category
-- (periodicDeliveryCategory in
-- packages/users-core/src/routes/users/reports/report-delivery-category.ts;
-- keep both lists in sync). A stuck queue
-- row (queued for more than 60 minutes, past the 15-minute worker lease) is
-- cancelled and re-requested in the same transaction, so a worker either
-- claimed it first (and this refuses) or never sees it twice. Delivery itself
-- goes through request_periodic_report_delivery with its guards; if that
-- refuses, the cancel is undone and nothing changes.
create or replace function private.request_periodic_report_resend(
  p_report_id uuid, p_ws_id uuid, p_expected_status text,
  p_delivery_enabled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  report private.external_user_monthly_reports%rowtype;
  queue private.user_report_email_queue%rowtype;
  result jsonb;
begin
  if p_expected_status is null
     or p_expected_status not in ('draft', 'queued', 'failed', 'blocked') then
    return jsonb_build_object('code', 400, 'message', 'Invalid resend state.');
  end if;
  select r.* into report from private.external_user_monthly_reports r
    join public.workspace_users u on u.id = r.user_id
    join public.workspace_user_groups g on g.id = r.group_id
    where r.id = p_report_id and u.ws_id = p_ws_id and g.ws_id = p_ws_id
    for update of r;
  if not found then
    return jsonb_build_object('code', 404, 'message', 'Report not found.');
  end if;
  if report.delivery_status is distinct from p_expected_status
     or report.report_approval_status is distinct from 'APPROVED'
     or report.delivered_at is not null
     -- The stage the admin saw: approved (held) for a draft, else the same
     -- as the delivery state. A report regenerating since is refused.
     or private.periodic_report_stage(report.generation_status,
       report.report_approval_status::text, report.delivery_status)
       is distinct from (case p_expected_status
         when 'draft' then 'approved' else p_expected_status end)
     or (p_expected_status = 'draft'
       and nullif(btrim(report.last_delivery_error), '') is not null) then
    return jsonb_build_object('code', 409, 'message', 'This report changed. Review it again.');
  end if;
  -- Only a retryable error: suppression, missing email, setup or approval
  -- errors need a fix first. Unknown outcomes are refused below.
  if p_expected_status in ('failed', 'blocked')
     and report.last_delivery_error ilike any (array[
       '%suppression%', '%unsubscribed%', '%recipient is blocked%',
       '%profile email is missing%', '%delivery gate blocked%', '%contract%',
       '%migration%', '%not configured%', '%approval changed%',
       '%not approved%', '%subject changed%']) then
    return jsonb_build_object('code', 409, 'message', 'Fix the delivery error before resending this report.');
  end if;
  select * into queue from private.user_report_email_queue
    where report_id = p_report_id for update;
  -- A test delivery stays a test: never re-request it as a real send.
  if queue.delivery_kind = 'test' then
    return jsonb_build_object('code', 409, 'message', 'Test deliveries are never resent. Send a test again, or use Send for the real report.');
  end if;
  -- Sent or possibly sent: never again. request_periodic_report_delivery
  -- also refuses these, but only for its own queue-row wording.
  if queue.sent_at is not null or queue.provider_message_id is not null
     or concat_ws(' ', report.last_delivery_error, queue.last_error)
       ilike any (array['%outcome is unknown%', '%provider accepted%']) then
    return jsonb_build_object('code', 409, 'message', 'Delivery may already have happened. Check provider logs.');
  end if;
  if p_expected_status = 'queued' and (
    coalesce(report.delivery_requested_at, queue.next_attempt_at) is null
    or coalesce(report.delivery_requested_at, queue.next_attempt_at) > now() - interval '60 minutes'
    or queue.next_attempt_at > now() - interval '60 minutes'
    or queue.locked_at > now() - interval '15 minutes'
  ) then
    return jsonb_build_object('code', 409, 'message', 'This report is not stuck.');
  end if;
  begin
    if p_expected_status = 'queued' and queue.status = 'queued' then
      update private.user_report_email_queue set status = 'cancelled',
        locked_at = null, locked_by = null, updated_at = now()
        where id = queue.id;
    end if;
    result := private.request_periodic_report_delivery(
      p_report_id, p_ws_id, 'send', p_delivery_enabled);
    if coalesce((result->>'code')::int, 0) <> 200 then
      raise exception using errcode = 'PR409', message = 'resend refused';
    end if;
  exception when sqlstate 'PR409' then
    return result;
  end;
  return result;
end;
$$;
revoke all on function private.request_periodic_report_resend(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function private.request_periodic_report_resend(uuid, uuid, text, boolean) to service_role;

-- Align the held Send now and Skip re-checks with the app's held rule: a
-- report with a recorded delivery error is a failure to resolve, not held.
create or replace function private.request_held_periodic_report_delivery(
  p_report_id uuid, p_ws_id uuid, p_delivery_enabled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  report private.external_user_monthly_reports%rowtype;
begin
  select r.* into report from private.external_user_monthly_reports r
    join public.workspace_users u on u.id = r.user_id
    join public.workspace_user_groups g on g.id = r.group_id
    where r.id = p_report_id and u.ws_id = p_ws_id and g.ws_id = p_ws_id
    for update of r;
  if not found then
    return jsonb_build_object('code', 404, 'message', 'Report not found.');
  end if;
  if report.delivery_status is distinct from 'draft'
     or report.report_approval_status is distinct from 'APPROVED'
     or report.delivered_at is not null
     or nullif(btrim(report.last_delivery_error), '') is not null
     or exists (select 1 from private.user_report_email_queue q
       where q.report_id = p_report_id and q.delivery_kind = 'send') then
    return jsonb_build_object('code', 409, 'message', 'This report is no longer held.');
  end if;
  return private.request_periodic_report_delivery(p_report_id, p_ws_id, 'send', p_delivery_enabled);
end;
$$;
revoke all on function private.request_held_periodic_report_delivery(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function private.request_held_periodic_report_delivery(uuid, uuid, boolean) to service_role;

-- Skip for held reports, scoped to the workspace by both the subject and the
-- class. Returns the ids actually skipped; anything no longer held is left.
create or replace function private.skip_held_periodic_reports(
  p_ws_id uuid, p_report_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  skipped uuid[];
begin
  with changed as (
    update private.external_user_monthly_reports r
      set delivery_status = 'skipped'
      from public.workspace_users u, public.workspace_user_groups g
      where r.id = any(p_report_ids)
        and u.id = r.user_id and u.ws_id = p_ws_id
        and g.id = r.group_id and g.ws_id = p_ws_id
        and r.delivery_status = 'draft'
        and r.report_approval_status = 'APPROVED'
        and r.delivered_at is null
        and nullif(btrim(r.last_delivery_error), '') is null
        and not exists (select 1 from private.user_report_email_queue q
          where q.report_id = r.id and q.delivery_kind = 'send')
      returning r.id
  )
  select coalesce(array_agg(id), '{}') into skipped from changed;
  return skipped;
end;
$$;
revoke all on function private.skip_held_periodic_reports(uuid, uuid[]) from public, anon, authenticated;
grant execute on function private.skip_held_periodic_reports(uuid, uuid[]) to service_role;

COMMIT;
