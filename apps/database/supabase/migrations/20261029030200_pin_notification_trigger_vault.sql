-- SR-327: never send a privileged bearer to a session-selected destination.
-- Provision notification_immediate_bearer in Vault separately; no GUC fallback.
-- Retire persisted legacy settings without exposing their values. Hosted
-- ownership restrictions must not prevent the trigger from being secured.
do $$
begin
  alter database postgres reset app.service_role_key;
exception when others then
  raise notice 'Could not reset database app.service_role_key (SQLSTATE %)', sqlstate;
end;
$$;

do $$
begin
  alter database postgres reset app.base_url;
exception when others then
  raise notice 'Could not reset database app.base_url (SQLSTATE %)', sqlstate;
end;
$$;

do $$
declare
  legacy record;
begin
  for legacy in
    select distinct r.rolname, s.setdatabase,
      split_part(setting, '=', 1) as setting_name
    from pg_catalog.pg_db_role_setting s
    join pg_catalog.pg_roles r on r.oid = s.setrole
    cross join lateral unnest(s.setconfig) as settings(setting)
    where s.setdatabase in (
      0, (select oid from pg_catalog.pg_database where datname = 'postgres')
    )
      and split_part(setting, '=', 1) in ('app.service_role_key', 'app.base_url')
  loop
    begin
      execute format('ALTER ROLE %I%s RESET %s', legacy.rolname,
        case when legacy.setdatabase = 0 then '' else ' IN DATABASE postgres' end,
        legacy.setting_name);
    exception when others then
      raise notice 'Could not reset role setting % (SQLSTATE %)',
        legacy.setting_name, sqlstate;
    end;
  end loop;
end;
$$;

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
    raise warning 'notification_immediate_bearer is not configured; immediate send suppressed';
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
