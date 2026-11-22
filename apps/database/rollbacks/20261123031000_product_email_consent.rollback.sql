-- Rollback for 20261123031000_product_email_consent.sql.
-- Apply as a new forward migration through the gated database workflow. It
-- refuses while any consent decision or audit row exists: consent evidence
-- must never be destroyed by a rollback. The audit guard rejects any delete
-- other than a user-erasure cascade, so the rows can only go by erasing their
-- users (or by a reviewed owner-level trigger disable). Export them first, and
-- stop every sender that reads private.product_email_recipients.
-- tuturuuu: reviewed(dynamic-sql-review): fixed evidence guard with no EXECUTE, interpolation or caller input.
do $$
begin
  perform set_config('lock_timeout', '5s', true);
  lock table private.user_product_email_consent,
    private.user_product_email_consent_events in access exclusive mode;
  if exists (select 1 from private.user_product_email_consent)
    or exists (select 1 from private.user_product_email_consent_events) then
    raise exception 'Product email consent evidence still exists';
  end if;
end;
$$;
-- Restore should_send_notification to the 20261029050200 body, keeping a
-- fail-closed marketing_communications email rule. It is replaced before the
-- consent view it currently reads is dropped.
create or replace function public.should_send_notification(
  p_user_id uuid,
  p_event_type text,
  p_channel text,
  p_scope public.notification_scope default 'workspace',
  p_ws_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_preference boolean;
begin
  if p_channel = 'email'
    and p_event_type in ('topic_due_soon', 'topic_late') then
    return false;
  end if;
  -- Fail closed: rolling back the consent tables must not turn marketing email
  -- back on. Without this clause the default below would answer true for every
  -- user who has no notification_preferences row.
  if p_channel = 'email' and p_event_type = 'marketing_communications' then
    return false;
  end if;
  if p_scope = 'workspace' and p_ws_id is not null then
    select enabled into v_preference from public.notification_preferences
    where user_id = p_user_id and ws_id = p_ws_id and event_type = p_event_type
      and channel = p_channel and scope = 'workspace';
  end if;
  if v_preference is null then
    select enabled into v_preference from public.notification_preferences
    where user_id = p_user_id and ws_id is null and event_type = p_event_type
      and channel = p_channel and scope in ('user', 'system');
  end if;
  return coalesce(v_preference, true);
end;
$$;
revoke all on function public.should_send_notification(uuid, text, text, public.notification_scope, uuid)
  from public, anon, authenticated;
grant execute on function public.should_send_notification(uuid, text, text, public.notification_scope, uuid)
  to service_role;
drop function public.list_product_email_consent_events(integer);
drop function public.get_product_email_consent();
drop function public.set_product_email_consent(boolean, text, text);
drop view private.product_email_recipients;
drop table private.user_product_email_consent_events;
drop table private.user_product_email_consent;
drop function private.guard_product_email_consent_event_change();
drop function private.reject_product_email_consent_event_truncate();
