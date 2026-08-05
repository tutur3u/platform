alter table private.external_chat_outbound_deliveries
  validate constraint external_chat_outbound_remote_message_length;

create or replace function private.external_chat_mark_reply_delivered(
  p_ws_id uuid,
  p_delivery_id uuid,
  p_remote_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_delivery private.external_chat_outbound_deliveries%rowtype;
  v_remote_message_id text := nullif(trim(p_remote_message_id), '');
begin
  if v_remote_message_id is null or char_length(v_remote_message_id) > 255 then
    raise exception 'external_chat_remote_message_id_invalid' using errcode = '22023';
  end if;

  select * into v_delivery
  from private.external_chat_outbound_deliveries
  where id = p_delivery_id and ws_id = p_ws_id
  for update;

  if v_delivery.id is null then
    raise exception 'external_chat_delivery_not_found' using errcode = 'P0002';
  end if;
  if v_delivery.cancelled_at is not null and v_delivery.delivered_at is null then
    raise exception 'external_chat_delivery_cancelled' using errcode = '55000';
  end if;
  if v_delivery.remote_message_id is not null
    and v_delivery.remote_message_id <> v_remote_message_id then
    raise exception 'external_chat_remote_message_id_mismatch' using errcode = '22023';
  end if;

  update private.external_chat_outbound_deliveries
  set delivered_at = coalesce(delivered_at, now()),
      remote_message_id = coalesce(remote_message_id, v_remote_message_id)
  where id = v_delivery.id;

  return jsonb_build_object(
    'deliveryId', v_delivery.id,
    'remoteMessageId', coalesce(v_delivery.remote_message_id, v_remote_message_id)
  );
end;
$$;

revoke all on function private.external_chat_mark_reply_delivered(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function private.external_chat_mark_reply_delivered(uuid, uuid, text)
  to service_role;
