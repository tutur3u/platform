alter table public.ai_chats
  add column if not exists archived_at timestamp with time zone;

create index if not exists ai_chats_creator_archived_created_idx
  on public.ai_chats (creator_id, archived_at, created_at desc);
