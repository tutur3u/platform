-- SR-327: never send a privileged bearer to a session-selected destination.
-- Provision notification_immediate_bearer in Vault separately; no GUC fallback.
create or replace function public.trigger_immediate_notification_send()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_endpoint constant text := 'https://tuturuuu.com/api/notifications/send-immediate';
  v_bearer text;
begin
  if new.delivery_mode is distinct from 'immediate' then
    return new;
  end if;

  select decrypted_secret into v_bearer
  from vault.decrypted_secrets
  where name = 'notification_immediate_bearer';

  if nullif(btrim(v_bearer), '') is null then
    return new;
  end if;

  perform net.http_post(
    url := v_endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_bearer
    ),
    body := jsonb_build_object('batch_id', new.id)
  );

  return new;
exception when others then
  -- Retain the pending batch without logging transport details or credentials.
  raise warning 'Immediate notification request was not queued';
  return new;
end;
$$;

revoke execute on function public.trigger_immediate_notification_send()
  from public, anon, authenticated;
grant execute on function public.trigger_immediate_notification_send()
  to service_role;

comment on function public.trigger_immediate_notification_send() is
  'Queues immediate notifications only to the pinned tuturuuu.com HTTPS endpoint using notification_immediate_bearer from Vault; missing credentials suppress transport.';
