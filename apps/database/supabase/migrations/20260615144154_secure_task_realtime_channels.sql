create schema if not exists private;

create or replace function private.can_join_task_realtime_topic(
  p_topic text,
  p_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  board_id_text text;
  topic_board_id uuid;
  user_email text;
begin
  if p_user_id is null or p_topic is null then
    return false;
  end if;

  if p_topic = 'task-user-realtime-' || p_user_id::text then
    return true;
  end if;

  if p_topic not like 'board-realtime-%' then
    return false;
  end if;

  board_id_text := substring(p_topic from length('board-realtime-') + 1);

  begin
    topic_board_id := board_id_text::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  if exists (
    select 1
    from public.workspace_boards board
    join public.workspace_members member
      on member.ws_id = board.ws_id
    where board.id = topic_board_id
      and board.deleted_at is null
      and member.user_id = p_user_id
  ) then
    return true;
  end if;

  select lower(private_details.email)
  into user_email
  from public.user_private_details private_details
  where private_details.user_id = p_user_id;

  return exists (
    select 1
    from public.task_board_shares share
    join public.workspace_boards board
      on board.id = share.board_id
    where share.board_id = topic_board_id
      and board.deleted_at is null
      and (
        share.shared_with_user_id = p_user_id
        or (
          user_email is not null
          and share.shared_with_email = user_email
        )
      )
  );
end;
$$;

revoke all on function private.can_join_task_realtime_topic(text, uuid)
from public, anon;
grant execute on function private.can_join_task_realtime_topic(text, uuid)
to authenticated;

drop policy if exists "task realtime private channels are scoped"
on realtime.messages;

create policy "task realtime private channels are scoped"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and private = true
  and private.can_join_task_realtime_topic(realtime.topic(), auth.uid())
);
