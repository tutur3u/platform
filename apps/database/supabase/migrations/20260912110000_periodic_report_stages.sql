-- One stage per report, with terminal delivery states taking precedence.
alter table private.external_user_monthly_reports
  drop constraint external_user_monthly_reports_delivery_status_check,
  add constraint external_user_monthly_reports_delivery_status_check
    check (delivery_status in ('draft', 'queued', 'processing', 'sent', 'failed', 'blocked', 'cancelled', 'skipped')) not valid;

create or replace function private.periodic_report_stage(generation text, approval text, delivery text)
returns text language sql immutable set search_path = '' as $$
  select case
    when delivery = 'sent' then 'sent'
    when delivery = 'skipped' then 'skipped'
    when approval = 'REJECTED' then 'rejected'
    when delivery = 'cancelled' then 'skipped'
    when delivery = 'processing' or generation = 'generating' then 'processing'
    when delivery = 'queued' then 'queued'
    when delivery = 'failed' or generation = 'failed' then 'failed'
    when delivery = 'blocked' then 'blocked'
    when generation = 'draft' then 'draft'
    when approval = 'APPROVED' then 'approved'
    else 'pending'
  end;
$$;
revoke all on function private.periodic_report_stage(text, text, text) from public, anon, authenticated;
grant execute on function private.periodic_report_stage(text, text, text) to service_role;

create or replace view private.external_user_monthly_reports_workspace_view as
select
  reports.*,
  report_user.ws_id as user_ws_id,
  report_user.full_name as user_full_name,
  report_user.display_name as user_display_name,
  report_user.email as user_email,
  report_user.archived as user_archived,
  report_user.archived_until as user_archived_until,
  report_user.note as user_note,
  report_group.ws_id as group_ws_id,
  report_group.name as group_name,
  creator.full_name as creator_full_name,
  creator.display_name as creator_display_name,
  creator.email as creator_email,
  modifier.full_name as modifier_full_name,
  modifier.display_name as modifier_display_name,
  modifier.email as modifier_email,
  private.periodic_report_stage(reports.generation_status, reports.report_approval_status::text, reports.delivery_status) as report_stage
from private.external_user_monthly_reports reports
left join public.workspace_users report_user
  on report_user.id = reports.user_id
left join public.workspace_user_groups report_group
  on report_group.id = reports.group_id
left join public.workspace_users creator
  on creator.id = reports.creator_id
left join public.workspace_users modifier
  on modifier.id = reports.updated_by;


create or replace function private.get_periodic_report_stage_counts(
  p_ws_id uuid, p_cadence text default 'monthly', p_group_ids uuid[] default null,
  p_period_start date default null, p_period_end date default null
) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(stage, total), '{}'::jsonb)
  from (
    select report_stage as stage, count(*) as total
    from private.external_user_monthly_reports_workspace_view
    where user_ws_id = p_ws_id and cadence = p_cadence
      and (p_group_ids is null or group_id = any(p_group_ids))
      and (p_period_start is null or period_end >= p_period_start)
      and (p_period_end is null or period_start <= p_period_end)
    group by report_stage
  ) counts;
$$;
revoke all on function private.get_periodic_report_stage_counts(uuid, text, uuid[], date, date) from public, anon, authenticated;
grant execute on function private.get_periodic_report_stage_counts(uuid, text, uuid[], date, date) to service_role;

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
  if new.delivery_status = 'skipped' then
    update private.user_report_email_queue
      set status = 'cancelled', locked_at = null, locked_by = null, updated_at = now()
      where report_id = new.id and status in ('queued', 'failed');
    return new;
  end if;
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

