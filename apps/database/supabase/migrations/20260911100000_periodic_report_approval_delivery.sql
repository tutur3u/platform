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
    where report_id = new.id and (
      (delivery_kind = 'send' and sent_at is not null)
      or last_error = 'Delivery worker timed out. Delivery outcome is unknown; check provider logs before retrying.'
    )
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
  p_report_id uuid, p_ws_id uuid, p_action text, p_delivery_enabled boolean default false
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
  requested_kind text;
begin
  if p_action is null or p_action not in ('send', 'test', 'retry', 'cancel') then
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
  if queue.last_error = 'Delivery worker timed out. Delivery outcome is unknown; check provider logs before retrying.'
     and p_action in ('send', 'test') then
    return jsonb_build_object('code', 409, 'message', 'Check provider logs, then use Retry for this delivery with an unknown outcome.');
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
  if p_action = 'retry' and (
    (queue.id is not null and queue.status not in ('failed', 'blocked'))
    or (queue.id is null and report.delivery_status not in ('failed', 'blocked'))
  ) then
    return jsonb_build_object('code', 409, 'message', 'This delivery cannot be retried. Use Send to start a new delivery.');
  end if;
  if p_delivery_enabled is distinct from true then
    update private.external_user_monthly_reports set delivery_status = 'blocked',
      last_delivery_error = 'Periodic report email delivery is disabled for this workspace.' where id = p_report_id;
    update private.user_report_email_queue set status = 'blocked',
      last_error = 'Periodic report email delivery is disabled for this workspace.', updated_at = now()
      where id = queue.id and status in ('failed', 'blocked');
    return jsonb_build_object('code', 409, 'message', 'Both workspace email gates must be enabled before periodic reports can send.');
  end if;
  requested_kind = case when p_action = 'test' then 'test'
    when p_action = 'retry' then coalesce(queue.delivery_kind, 'send') else 'send' end;
  select * into subject from public.workspace_users where id = report.user_id and ws_id = p_ws_id;
  if nullif(btrim(subject.email), '') is null then
    update private.external_user_monthly_reports set delivery_status = 'blocked',
      last_delivery_error = 'Subject profile email is missing.' where id = p_report_id;
    return jsonb_build_object('code', 409, 'message', 'Subject profile email is missing.');
  end if;
  insert into private.user_report_email_queue
    (report_id, ws_id, user_id, recipient_email, delivery_kind, status)
    values (p_report_id, p_ws_id, subject.id, lower(btrim(subject.email)),
      requested_kind, 'queued')
    on conflict (report_id) do update set status = 'queued',
      delivery_kind = excluded.delivery_kind, recipient_email = excluded.recipient_email,
      user_id = excluded.user_id, ws_id = excluded.ws_id,
      attempt_count = 0, sent_at = null, provider_message_id = null,
      locked_at = null, locked_by = null, last_error = null,
      next_attempt_at = now(), updated_at = now();
  update private.external_user_monthly_reports set delivery_status = 'queued',
    delivery_requested_at = now(), last_delivery_error = null where id = p_report_id;
  return jsonb_build_object('code', 200, 'message', case when requested_kind = 'test' then 'Test delivery queued for the subject profile email.' else 'Periodic report delivery queued.' end, 'queued', true, 'status', 'queued');
end;
$$;
revoke all on function private.request_periodic_report_delivery(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function private.request_periodic_report_delivery(uuid, uuid, text, boolean) to service_role;

-- Retain the existing fifteen-minute lease boundary. A timed-out claim needs
-- explicit operator review/retry, never automatic redelivery.
create or replace function private.claim_periodic_report_emails(
  p_worker_id text,
  p_limit integer default 10,
  p_now timestamptz default now()
)
returns setof private.user_report_email_queue
language plpgsql
security definer
set search_path = ''
as $$
declare
  stale_report_id uuid;
  candidate_report_id uuid;
  claimed_queue private.user_report_email_queue%rowtype;
  stale_queue private.user_report_email_queue%rowtype;
  recovery_error constant text := 'Delivery worker timed out. Delivery outcome is unknown; check provider logs before retrying.';
begin
  -- Recover abandoned claims without resending an email with an unknown outcome.
  -- Match the report -> queue lock order used by approval and manual requests.
  for stale_report_id in
    select report.id from private.external_user_monthly_reports report
    join private.user_report_email_queue queue on queue.report_id = report.id
    where queue.status = 'processing'
      and coalesce(queue.locked_at, queue.updated_at) < p_now - interval '15 minutes'
    order by queue.updated_at, queue.id
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update of report skip locked
  loop
    select * into stale_queue from private.user_report_email_queue
      where report_id = stale_report_id and status = 'processing'
        and coalesce(locked_at, updated_at) < p_now - interval '15 minutes'
      for update skip locked;
    if not found then continue; end if;
    update private.user_report_email_queue set status = 'blocked',
      last_error = recovery_error, locked_at = null, locked_by = null, updated_at = p_now
      where id = stale_queue.id;
    update private.external_user_monthly_reports set delivery_status = 'blocked',
      last_delivery_error = recovery_error,
      delivered_at = case when stale_queue.delivery_kind = 'send'
        then coalesce(delivered_at, stale_queue.sent_at) else delivered_at end
      where id = stale_report_id;
    insert into private.user_report_email_attempts(queue_id, status, attempted_at, error_message, provider_message_id)
      values (stale_queue.id, 'blocked', p_now, recovery_error, stale_queue.provider_message_id);
  end loop;

  -- Claim the report and queue together in the same lock order as recovery.
  for candidate_report_id in
    select report.id from private.external_user_monthly_reports report
    join private.user_report_email_queue queue on queue.report_id = report.id
    where queue.status in ('queued', 'failed') and queue.next_attempt_at <= p_now
      and (queue.locked_at is null or queue.locked_at < p_now - interval '15 minutes')
    order by queue.next_attempt_at, queue.created_at, queue.id
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update of report skip locked
  loop
    select * into claimed_queue from private.user_report_email_queue
      where report_id = candidate_report_id and status in ('queued', 'failed')
        and next_attempt_at <= p_now
        and (locked_at is null or locked_at < p_now - interval '15 minutes')
      for update skip locked;
    if not found then continue; end if;
    update private.user_report_email_queue set status = 'processing',
      locked_at = p_now, locked_by = p_worker_id,
      attempt_count = attempt_count + 1, updated_at = p_now
      where id = claimed_queue.id returning * into claimed_queue;
    update private.external_user_monthly_reports set delivery_status = 'processing'
      where id = candidate_report_id;
    return next claimed_queue;
  end loop;
end;
$$;


-- Complete queue and report tracking atomically, only for the original lease.
create or replace function private.finish_periodic_report_email(
  p_queue_id uuid, p_worker_id text, p_locked_at timestamptz,
  p_status text, p_recipient_email text, p_error text default null,
  p_sent_at timestamptz default null, p_provider_message_id text default null,
  p_next_attempt_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_id_to_lock uuid;
  queue private.user_report_email_queue%rowtype;
  final_status text;
begin
  if p_status is null or p_status not in ('sent', 'failed', 'blocked')
     or (p_status = 'sent' and p_sent_at is null) then
    raise exception 'Invalid delivery completion status';
  end if;
  select report_id into report_id_to_lock from private.user_report_email_queue where id = p_queue_id;
  perform 1 from private.external_user_monthly_reports where id = report_id_to_lock for update;
  select * into queue from private.user_report_email_queue
    where id = p_queue_id and status = 'processing'
      and locked_by = p_worker_id and locked_at = p_locked_at for update;
  if not found then return false; end if;
  final_status := case when p_sent_at is not null and p_status = 'failed' then 'blocked' else p_status end;
  update private.user_report_email_queue set status = final_status,
    recipient_email = p_recipient_email, last_error = p_error,
    sent_at = coalesce(p_sent_at, sent_at),
    provider_message_id = coalesce(p_provider_message_id, provider_message_id),
    locked_at = null, locked_by = null,
    next_attempt_at = coalesce(p_next_attempt_at, next_attempt_at), updated_at = now()
    where id = queue.id;
  update private.external_user_monthly_reports
    set delivery_status = case when final_status = 'sent' and queue.delivery_kind = 'test' then 'draft' else final_status end,
      last_delivery_error = p_error,
      delivered_at = case when queue.delivery_kind = 'send' then coalesce(p_sent_at, delivered_at) else delivered_at end
    where id = queue.report_id;
  return true;
end;
$$;
revoke all on function private.finish_periodic_report_email(uuid,text,timestamptz,text,text,text,timestamptz,text,timestamptz) from public, anon, authenticated;
grant execute on function private.finish_periodic_report_email(uuid,text,timestamptz,text,text,text,timestamptz,text,timestamptz) to service_role;
