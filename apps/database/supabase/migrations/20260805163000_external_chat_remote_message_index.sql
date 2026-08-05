create unique index concurrently external_chat_outbound_remote_message_key
  on private.external_chat_outbound_deliveries (
    ws_id, thread_id, remote_message_id
  )
  where remote_message_id is not null;
