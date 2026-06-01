-- Reintroduce database-owned limits for legacy public AI chat messages.
-- The previous cleanup migration removed generic text constraints so assistant
-- metadata and private chat internals could evolve, but this public table and
-- RPC are still reachable through PostgREST. Keep existing rows untouched while
-- enforcing the limit for every new write.

alter table public.ai_chat_messages
  drop constraint if exists ai_chat_messages_content_length_check;

alter table public.ai_chat_messages
  add constraint ai_chat_messages_content_length_check
  check (content is null or char_length(content) <= 10000)
  not valid;

alter table public.ai_chat_messages
  drop constraint if exists ai_chat_messages_content_bytes_check;

alter table public.ai_chat_messages
  add constraint ai_chat_messages_content_bytes_check
  check (content is null or octet_length(content) <= 40000)
  not valid;

create or replace function public.insert_ai_chat_message(
    message text,
    chat_id uuid,
    source text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content text := message;
begin
  if char_length(v_content) > 10000
    or octet_length(v_content) > 40000 then
    raise exception 'ai_chat_message_content_too_large'
      using errcode = '22023';
  end if;

  insert into ai_chat_messages (chat_id, content, creator_id, role, metadata)
  values (
    chat_id,
    v_content,
    auth.uid(),
    'USER',
    jsonb_build_object('source', coalesce(source, 'Unknown'))
  );
end;
$$;
