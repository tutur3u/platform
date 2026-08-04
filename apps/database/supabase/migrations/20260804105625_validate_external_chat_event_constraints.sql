alter table private.external_chat_events
  validate constraint external_chat_events_kind_check;

alter table private.external_chat_events
  validate constraint external_chat_events_delivery_mode_check;

alter table private.external_chat_events
  validate constraint external_chat_events_source_digest_check;
