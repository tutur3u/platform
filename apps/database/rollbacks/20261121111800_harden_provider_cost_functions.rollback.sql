begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Restores the definitions from 20261121101400 and 20261121103000. Grants
-- are unchanged by create or replace.
-- tuturuuu: no-grant (internal)
create or replace function private.lock_provider_cost_day(
  p_provider text, p_account_id text, p_usage_date date
) returns void
language sql security definer set search_path = pg_catalog, pg_temp as $$
  select pg_advisory_xact_lock(hashtextextended(
    format('provider_cost:%s:%s:%s', p_provider, p_account_id, p_usage_date), 0));
$$;

create or replace function private.record_provider_cost_day(
  p_provider text, p_account_id text, p_usage_date date,
  p_collected_at timestamptz, p_lines jsonb
) returns integer
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  day_row private.provider_cost_collection_days;
  line_count integer;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'p_lines must be an array' using errcode = '22023';
  end if;
  line_count := jsonb_array_length(p_lines);
  if line_count > 2000 then
    raise exception 'Too many cost lines for one day' using errcode = '22023';
  end if;
  if p_collected_at > now() + interval '5 minutes' then
    raise exception 'Collection time is in the future' using errcode = '22023';
  end if;

  perform private.lock_provider_cost_day(p_provider, p_account_id, p_usage_date);
  select * into day_row from private.provider_cost_collection_days d
    where d.provider = p_provider and d.account_id = p_account_id and d.usage_date = p_usage_date;
  if found and (day_row.status = 'budget_exhausted'
      or day_row.collected_at >= p_collected_at) then
    return 0;
  end if;

  delete from private.provider_cost_lines l
    where l.provider = p_provider and l.account_id = p_account_id and l.usage_date = p_usage_date;
  insert into private.provider_cost_lines (
    provider, account_id, usage_date, line_key, service, sku, app_id, environment,
    quantity, unit, list_amount_usd, billed_amount_usd, collected_at
  )
  select p_provider, p_account_id, p_usage_date,
    encode(sha256(convert_to(concat_ws(chr(31), line.service, line.sku, line.app_id, line.environment, line.unit), 'UTF8')), 'hex'),
    line.service, line.sku, line.app_id, line.environment,
    sum(line.quantity), line.unit, sum(line.list_amount_usd), sum(line.billed_amount_usd), p_collected_at
  from (
    select raw.service, coalesce(raw.sku, '') as sku, coalesce(raw.app_id, '') as app_id,
      coalesce(raw.environment, 'shared') as environment, coalesce(raw.quantity, 0) as quantity,
      coalesce(raw.unit, '') as unit, raw.list_amount_usd, raw.billed_amount_usd
    from jsonb_to_recordset(p_lines) as raw(
      service text, sku text, app_id text, environment text, quantity numeric,
      unit text, list_amount_usd numeric, billed_amount_usd numeric
    )
  ) line
  group by line.service, line.sku, line.app_id, line.environment, line.unit;

  insert into private.provider_cost_collection_days as d
    (provider, account_id, usage_date, status, attempts, line_count, collected_at, attempted_at)
  values (p_provider, p_account_id, p_usage_date, 'complete', 0, line_count, p_collected_at, now())
  on conflict (provider, account_id, usage_date) do update
    set status = 'complete', attempts = 0, line_count = excluded.line_count,
      collected_at = excluded.collected_at;
  return line_count;
end $$;

create or replace function private.send_root_operator_alert(
  p_kind text, p_dedupe_key text, p_title text, p_description text,
  p_data jsonb, p_permissions text[], p_priority public.notification_priority
) returns integer
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  root_id constant uuid := '00000000-0000-0000-0000-000000000000';
  member record;
  notification_id uuid;
  sent integer := 0;
begin
  if length(coalesce(p_title, '')) not between 1 and 200
    or length(coalesce(p_description, '')) > 2000
    or jsonb_typeof(coalesce(p_data, '{}'::jsonb)) <> 'object'
    or coalesce(cardinality(p_permissions), 0) not between 1 and 8
    or array_position(p_permissions, null) is not null then
    raise exception 'Invalid operator alert' using errcode = '22023';
  end if;
  insert into private.root_operator_alerts (dedupe_key, kind, recipients)
    values (p_dedupe_key, p_kind, 0)
    on conflict (dedupe_key) do nothing;
  if not found then
    return null;
  end if;
  for member in
    select m.user_id from public.workspace_members m
    where m.ws_id = root_id
      and not exists (
        select 1 from unnest(p_permissions) as required(permission)
        where not public.has_workspace_permission(root_id, m.user_id, required.permission)
      )
    order by m.user_id
    limit 50
  loop
    notification_id := public.create_notification(
      p_ws_id => root_id,
      p_user_id => member.user_id,
      p_type => 'system_announcement',
      p_code => p_kind,
      p_title => p_title,
      p_description => p_description,
      p_data => coalesce(p_data, '{}'::jsonb) || jsonb_build_object('kind', p_kind),
      p_scope => 'workspace',
      p_priority => p_priority
    );
    if notification_id is not null then
      sent := sent + 1;
    end if;
  end loop;
  if sent = 0 then
    delete from private.root_operator_alerts where dedupe_key = p_dedupe_key;
  else
    update private.root_operator_alerts set recipients = sent where dedupe_key = p_dedupe_key;
  end if;
  return sent;
end $$;

revoke all on function private.lock_provider_cost_day(text,text,date) from public, anon, authenticated, service_role;
revoke all on function private.record_provider_cost_day(text,text,date,timestamptz,jsonb) from public, anon, authenticated;
revoke all on function private.send_root_operator_alert(text,text,text,text,jsonb,text[],public.notification_priority) from public, anon, authenticated;
grant execute on function private.record_provider_cost_day(text,text,date,timestamptz,jsonb) to service_role;
grant execute on function private.send_root_operator_alert(text,text,text,text,jsonb,text[],public.notification_priority) to service_role;

commit;
