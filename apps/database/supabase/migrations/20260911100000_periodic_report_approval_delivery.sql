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

-- Keep queue/report state in the same transaction, including manual requests,
-- worker claims and approval revocation. A concurrent approval change either
-- commits first and rejects the queue write, or cancels the queued delivery.
create or replace function private.sync_periodic_report_delivery_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  report private.external_user_monthly_reports%rowtype;
begin
  select * into report from private.external_user_monthly_reports
    where id = new.report_id for update;
  if new.status = 'queued' then
    if report.report_approval_status <> 'APPROVED' then
      raise exception 'Report is not approved.' using errcode = '23514';
    end if;
    if report.delivered_at is not null then
      raise exception 'Report was already sent.' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' then
      if old.delivery_kind = 'send' and old.sent_at is not null then
        raise exception 'Provider already accepted this delivery.' using errcode = '23514';
      end if;
    end if;
  end if;
  update private.external_user_monthly_reports
    set delivery_status = case when new.status = 'sent' and new.delivery_kind = 'test'
          then 'draft' else new.status end,
        delivery_requested_at = case when new.status = 'queued' then now() else delivery_requested_at end,
        last_delivery_error = new.last_error,
        delivered_at = case when new.delivery_kind = 'send' and new.sent_at is not null
          then new.sent_at else delivered_at end
    where id = new.report_id;
  return new;
end;
$$;
revoke all on function private.sync_periodic_report_delivery_state() from public, anon, authenticated;
create trigger sync_periodic_report_delivery_state
  after insert or update of status on private.user_report_email_queue
  for each row execute function private.sync_periodic_report_delivery_state();
