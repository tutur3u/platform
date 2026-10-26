-- Keep this concurrent index as the only statement in this migration.
-- Chat restore and Live seed history read one chat's messages ordered by
-- (created_at, id); without this index each read scans every chat's messages.
create index concurrently if not exists ai_chat_messages_chat_created_idx
on public.ai_chat_messages (chat_id, created_at, id);
