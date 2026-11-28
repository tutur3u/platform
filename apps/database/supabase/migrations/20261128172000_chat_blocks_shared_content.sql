-- Chat user blocks: a conversation's shared links, files and photos skip
-- content from people the viewer blocked. A link is hidden when a blocked
-- person sent its message; a file or photo is hidden when a blocked person
-- sent its message or uploaded it. Unblocking shows them again.
--
-- private.chat_list_shared_content keeps its signature, access check,
-- ordering, definer rights and service_role-only execute; the NOT EXISTS
-- filters against private.chat_user_blocks
-- (20261128170000_chat_user_blocks.sql) are the only change. Product decision
-- and scope: apps/docs/platform/chat-safety-and-ai-consent.mdx.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function private.chat_list_shared_content(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
begin
  if private.chat_get_conversation(
    p_ws_id,
    p_conversation_id,
    p_actor_user_id
  ) is null then
    raise exception 'chat_conversation_forbidden'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'links',
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'messageId', link_rows.message_id,
            'conversationId', p_conversation_id,
            'url', link_rows.url,
            'createdAt', link_rows.created_at,
            'sender', link_rows.sender
          )
          order by link_rows.created_at desc
        ),
        '[]'::jsonb
      )
      from (
        select
          m.id as message_id,
          m.created_at,
          private.chat_member_profile_json(c.ws_id, m.sender_id) as sender,
          regexp_replace(matches.url_parts[1], '[\.,;:!\?\)\]]+$', '') as url
        from private.chat_messages m
        join private.chat_conversations c on c.id = m.conversation_id
        cross join lateral regexp_matches(
          coalesce(m.content, ''),
          '(https?://[^[:space:]<>"'']+)',
          'g'
        ) as matches(url_parts)
        where m.conversation_id = p_conversation_id
          and m.deleted_at is null
          and not exists (
            select 1
            from private.chat_user_blocks b
            where b.blocker_user_id = p_actor_user_id
              and b.blocked_user_id = m.sender_id
          )
      ) link_rows
    ),
    'files',
    (
      select coalesce(
        jsonb_agg(private.chat_attachment_json(a) order by a.created_at desc),
        '[]'::jsonb
      )
      from private.chat_message_attachments a
      left join private.chat_messages am on am.id = a.message_id
      where a.conversation_id = p_conversation_id
        and a.message_id is not null
        and a.deleted_at is null
        and (
          a.content_type is null
          or a.content_type not ilike 'image/%'
        )
        and not exists (
          select 1
          from private.chat_user_blocks b
          where b.blocker_user_id = p_actor_user_id
            and b.blocked_user_id in (a.uploader_id, am.sender_id)
        )
    ),
    'photos',
    (
      select coalesce(
        jsonb_agg(private.chat_attachment_json(a) order by a.created_at desc),
        '[]'::jsonb
      )
      from private.chat_message_attachments a
      left join private.chat_messages am on am.id = a.message_id
      where a.conversation_id = p_conversation_id
        and a.message_id is not null
        and a.deleted_at is null
        and a.content_type ilike 'image/%'
        and not exists (
          select 1
          from private.chat_user_blocks b
          where b.blocker_user_id = p_actor_user_id
            and b.blocked_user_id in (a.uploader_id, am.sender_id)
        )
    )
  );
end;
$$;

revoke all on function private.chat_list_shared_content(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.chat_list_shared_content(uuid, uuid, uuid)
  to service_role;

commit;
