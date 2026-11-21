-- Push notification routines resolve names with pg_catalog first and pg_temp
-- last, and only service_role may execute them. The batch helper and the
-- recovery function are redefined with the pinned path; their bodies are
-- unchanged. The other routines keep their definitions and gain explicit ACLs.

create or replace function public.get_or_create_notification_batch(
  p_ws_id uuid,
  p_user_id uuid,
  p_channel text,
  p_window_minutes integer default 10,
  p_email text default null,
  p_delivery_mode public.notification_delivery_mode default 'batched'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, private, public, pg_temp
as $$
declare
  v_batch_id uuid;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_delivery_mode public.notification_delivery_mode := p_delivery_mode;
begin
  if p_channel = 'push' then
    v_delivery_mode := case
      when p_delivery_mode = 'immediate'
        and private.push_recipient_reachable(p_user_id)
        then 'immediate'::public.notification_delivery_mode
      when p_delivery_mode = 'batched'
        and private.push_immediate_admitted(p_user_id)
        then 'immediate'::public.notification_delivery_mode
      else 'batched'::public.notification_delivery_mode
    end;
  end if;

  if v_delivery_mode = 'immediate' then
    v_window_start := now();
    v_window_end := now();

    insert into private.notification_batches (
      ws_id,
      user_id,
      email,
      channel,
      window_start,
      window_end,
      delivery_mode
    ) values (
      p_ws_id,
      p_user_id,
      p_email,
      p_channel,
      v_window_start,
      v_window_end,
      'immediate'
    )
    returning id into v_batch_id;

    return v_batch_id;
  end if;

  if p_user_id is not null then
    select id into v_batch_id
    from private.notification_batches
    where (ws_id = p_ws_id or (ws_id is null and p_ws_id is null))
      and user_id = p_user_id
      and channel = p_channel
      and status = 'pending'
      and delivery_mode = 'batched'
      and window_end > now()
    order by window_start desc
    limit 1;
  elsif p_email is not null then
    select id into v_batch_id
    from private.notification_batches
    where (ws_id = p_ws_id or (ws_id is null and p_ws_id is null))
      and email = p_email
      and channel = p_channel
      and status = 'pending'
      and delivery_mode = 'batched'
      and window_end > now()
    order by window_start desc
    limit 1;
  end if;

  if v_batch_id is null then
    v_window_start := now();
    v_window_end := now() + (p_window_minutes || ' minutes')::interval;

    insert into private.notification_batches (
      ws_id,
      user_id,
      email,
      channel,
      window_start,
      window_end,
      delivery_mode
    ) values (
      p_ws_id,
      p_user_id,
      p_email,
      p_channel,
      v_window_start,
      v_window_end,
      'batched'
    )
    returning id into v_batch_id;
  end if;

  return v_batch_id;
end;
$$;

revoke all on function public.get_or_create_notification_batch(
  uuid, uuid, text, integer, text, public.notification_delivery_mode
) from public, anon, authenticated;
grant execute on function public.get_or_create_notification_batch(
  uuid, uuid, text, integer, text, public.notification_delivery_mode
) to service_role;

create or replace function private.requeue_mail_push_batches()
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_batch record;
  v_count integer := 0;
begin
  for v_batch in
    select b.id, b.status, b.error_message, b.created_at from private.notification_batches b
    where b.channel in ('push', 'email') and b.delivery_mode = 'immediate'
      and (b.channel = 'push'
        or b.ws_id = '00000000-0000-0000-0000-000000000000'::uuid
        or (b.ws_id is null and exists (
          select 1 from private.notification_delivery_log l
          join public.notifications n on n.id = l.notification_id
          where l.batch_id = b.id and (
            coalesce(n.ws_id::text, n.entity_id::text, n.data->>'workspace_id') = '00000000-0000-0000-0000-000000000000'
            or (b.channel = 'push' and exists (select 1 from private.mail_notification_receipts r
              where r.notification_id = n.id))
          )
        )))
      and (b.status = 'failed' or (b.status = 'processing' and b.updated_at < now() - interval '10 minutes'))
      and coalesce(b.error_message, '') not in ('delivery_outcome_unknown', 'retry_limit_exhausted', 'delivery_expired')
    order by b.updated_at limit 100
    for update skip locked
  loop
    if not exists (select 1 from private.notification_delivery_log l
      where l.batch_id = v_batch.id and l.status <> 'sent') then
      update private.notification_batches set status = 'sent', sent_at = now(), updated_at = now(), error_message = null
      where id = v_batch.id;
      continue;
    end if;
    if v_batch.error_message = 'delivery_in_flight'
      or v_batch.created_at <= now() - interval '1 day'
      or not exists (select 1 from private.notification_delivery_log l
        where l.batch_id = v_batch.id and l.status <> 'sent' and coalesce(l.retry_count, 0) < 3) then
      update private.notification_batches set status = 'failed', updated_at = now(),
        error_message = case
          when v_batch.error_message = 'delivery_in_flight' then 'delivery_outcome_unknown'
          when v_batch.created_at <= now() - interval '1 day' then 'delivery_expired'
          else 'retry_limit_exhausted' end
      where id = v_batch.id;
      continue;
    end if;
    update private.notification_delivery_log set status = 'pending', updated_at = now(),
      retry_count = coalesce(retry_count, 0) + case when v_batch.status = 'processing' then 1 else 0 end
    where batch_id = v_batch.id and status <> 'sent' and coalesce(retry_count, 0) < 3;
    update private.notification_batches set status = 'pending', updated_at = now(), error_message = null
    where id = v_batch.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.requeue_mail_push_batches()
  from public, anon, authenticated;
grant execute on function private.requeue_mail_push_batches() to service_role;

revoke all on function private.push_recipient_reachable(uuid)
  from public, anon, authenticated;
grant execute on function private.push_recipient_reachable(uuid) to service_role;

revoke all on function private.push_immediate_admitted(uuid)
  from public, anon, authenticated;
grant execute on function private.push_immediate_admitted(uuid) to service_role;

revoke all on function private.push_delivery_latency_summary(timestamptz)
  from public, anon, authenticated;
grant execute on function private.push_delivery_latency_summary(timestamptz)
  to service_role;
