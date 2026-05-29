alter table private.chat_conversation_ai_settings
  add column if not exists thinking_mode text not null default 'fast',
  add column if not exists credit_source text not null default 'workspace',
  add column if not exists credit_ws_id uuid;

alter table private.chat_conversation_ai_settings
  drop constraint if exists chat_conversation_ai_settings_thinking_mode_check;

alter table private.chat_conversation_ai_settings
  add constraint chat_conversation_ai_settings_thinking_mode_check
    check (thinking_mode in ('fast', 'thinking'));

alter table private.chat_conversation_ai_settings
  drop constraint if exists chat_conversation_ai_settings_credit_source_check;

alter table private.chat_conversation_ai_settings
  add constraint chat_conversation_ai_settings_credit_source_check
    check (credit_source in ('workspace', 'personal'));

create index if not exists ai_credit_transactions_chat_message_created_idx
  on public.ai_credit_transactions (chat_message_id, created_at desc)
  where chat_message_id is not null;
