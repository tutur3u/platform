create function public.workspace_usage_summary(p_ws uuid)
returns table(meter text, cap bigint, spent bigint, held bigint, available bigint, ends_at timestamptz, blocked boolean)
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select p.meter,p.cap,p.spent,p.held,
    greatest(0, least(p.cap-p.spent-p.held, coalesce(g.available,0)))::bigint,
    p.ends_at,p.blocked
  from private.usage_meter_periods p
  left join lateral (
    select sum(units-spent-held) as available from private.usage_grants g
    where g.ws_id=p.ws_id and g.meter=p.meter and g.starts_at<=now() and g.expires_at>now()
  ) g on true
  where p.ws_id=p_ws and p.starts_at<=now() and p.ends_at>now()
  order by p.meter
$$;
revoke all on function public.workspace_usage_summary(uuid) from public,anon,authenticated;
grant execute on function public.workspace_usage_summary(uuid) to service_role;
