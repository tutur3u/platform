-- Opt-in automatic delivery applies only to future approval transitions.
create or replace function private.queue_approved_periodic_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject public.workspace_users%rowtype;
  queued_id uuid;
begin
  if tg_op = 'UPDATE' then
    if old.report_approval_status is not distinct from new.report_approval_status then return new; end if;
  end if;
  if new.report_approval_status <> 'APPROVED' then
    update private.user_report_email_queue
      set status = 'cancelled', locked_at = null, locked_by = null,
          updated_at = now()
      where report_id = new.id and status in ('queued', 'failed');
    if found then
      update private.external_user_monthly_reports
        set delivery_status = 'cancelled' where id = new.id;
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.report_approval_status = 'APPROVED' then return new; end if;
  end if;

  select * into subject from public.workspace_users where id = new.user_id;
  if subject.id is null or not exists (
    select 1 from public.workspace_configs
    where ws_id = subject.ws_id and id = 'AUTO_SEND_APPROVED_REPORTS' and value = 'true'
  ) then return new; end if;

  -- Never automatically resend a successfully delivered report.
  if new.delivered_at is not null or exists (
    select 1 from private.user_report_email_queue
    where report_id = new.id and delivery_kind = 'send' and sent_at is not null
  ) then return new; end if;
  if nullif(btrim(subject.email), '') is null then
    update private.external_user_monthly_reports
      set delivery_status = 'blocked', last_delivery_error = 'Subject profile email is missing.'
      where id = new.id;
    return new;
  end if;

  insert into private.user_report_email_queue
    (report_id, ws_id, user_id, recipient_email, delivery_kind, status)
    values (new.id, subject.ws_id, subject.id, lower(btrim(subject.email)), 'send', 'queued')
  on conflict (report_id) do update
    set status = 'queued', delivery_kind = 'send', attempt_count = 0,
        recipient_email = excluded.recipient_email, user_id = excluded.user_id,
        next_attempt_at = now(), locked_at = null, locked_by = null,
        last_error = null, sent_at = null, provider_message_id = null, updated_at = now()
    where user_report_email_queue.status in ('cancelled', 'blocked', 'failed')
       or (user_report_email_queue.status = 'sent' and user_report_email_queue.delivery_kind = 'test')
  returning id into queued_id;

  if queued_id is not null then
    update private.external_user_monthly_reports
      set delivery_status = 'queued', delivery_requested_at = now(), last_delivery_error = null
      where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.queue_approved_periodic_report() from public, anon, authenticated;
create trigger queue_approved_periodic_report
  after insert or update
  on private.external_user_monthly_reports
  for each row execute function private.queue_approved_periodic_report();

-- Lock the report before the queue, matching approval transitions. Worker queue
-- claims/writes remain separate transactions and never lock reports in reverse.
create or replace function private.request_periodic_report_delivery(
  p_report_id uuid, p_ws_id uuid, p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  report private.external_user_monthly_reports%rowtype;
  queue private.user_report_email_queue%rowtype;
  subject public.workspace_users%rowtype;
  queued_id uuid;
begin
  if p_action not in ('send', 'test', 'retry', 'cancel') then
    return jsonb_build_object('code', 400, 'message', 'Invalid delivery action.');
  end if;
  select r.* into report from private.external_user_monthly_reports r
    join public.workspace_users u on u.id = r.user_id
    where r.id = p_report_id and u.ws_id = p_ws_id for update of r;
  if not found then
    return jsonb_build_object('code', 404, 'message', 'Report not found.');
  end if;
  select * into queue from private.user_report_email_queue
    where report_id = p_report_id for update;
  if report.delivered_at is not null or report.delivery_status in ('sent', 'processing')
     or queue.status = 'processing'
     or (queue.delivery_kind = 'send' and queue.sent_at is not null) then
    return jsonb_build_object('code', 409, 'message', 'Delivery is already active or sent.');
  end if;
  if p_action = 'cancel' then
    if queue.id is null or queue.status not in ('queued', 'failed') then
      return jsonb_build_object('code', 409, 'message', 'No waiting delivery to cancel.');
    end if;
    update private.user_report_email_queue set status = 'cancelled',
      locked_at = null, locked_by = null, updated_at = now() where id = queue.id;
    update private.external_user_monthly_reports set delivery_status = 'cancelled'
      where id = p_report_id;
    return jsonb_build_object('code', 200, 'message', 'Delivery cancelled.', 'queued', false, 'status', 'cancelled');
  end if;
  if report.report_approval_status <> 'APPROVED' then
    return jsonb_build_object('code', 409, 'message', 'Approve this report before sending it.');
  end if;
  if queue.status = 'queued' or (queue.status = 'sent' and queue.delivery_kind = 'send') then
    return jsonb_build_object('code', 409, 'message', 'Delivery is already active or sent.');
  end if;
  select * into subject from public.workspace_users where id = report.user_id and ws_id = p_ws_id;
  if nullif(btrim(subject.email), '') is null then
    update private.external_user_monthly_reports set delivery_status = 'blocked',
      last_delivery_error = 'Subject profile email is missing.' where id = p_report_id;
    return jsonb_build_object('code', 409, 'message', 'Subject profile email is missing.');
  end if;
  insert into private.user_report_email_queue
    (report_id, ws_id, user_id, recipient_email, delivery_kind, status)
    values (p_report_id, p_ws_id, subject.id, lower(btrim(subject.email)),
      case when p_action = 'test' then 'test' else 'send' end, 'queued')
    on conflict (report_id) do update set status = 'queued',
      delivery_kind = excluded.delivery_kind, recipient_email = excluded.recipient_email,
      attempt_count = 0, sent_at = null, provider_message_id = null,
      locked_at = null, locked_by = null, last_error = null,
      next_attempt_at = now(), updated_at = now()
    returning id into queued_id;
  update private.external_user_monthly_reports set delivery_status = 'queued',
    delivery_requested_at = now(), last_delivery_error = null where id = p_report_id;
  return jsonb_build_object('code', 200, 'message', 'Periodic report delivery queued.', 'queued', true, 'status', 'queued');
end;
$$;
revoke all on function private.request_periodic_report_delivery(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.request_periodic_report_delivery(uuid, uuid, text) to service_role;
