create or replace function private.chat_list_conversations(
  p_ws_id uuid,
  p_actor_user_id uuid,
  p_archived text default 'active'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_archived text := case
    when p_archived in ('active', 'archived', 'all') then p_archived
    else 'active'
  end;
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  return (
    select coalesce(
      jsonb_agg(
        private.chat_conversation_json(c.id, p_actor_user_id)
          || jsonb_build_object(
            'archivedAt',
            (coalesce(c.archived_at, own_member.archived_at))::text
          )
        order by coalesce(latest.latest_at, c.updated_at) desc, c.created_at desc
      ),
      '[]'::jsonb
    )
    from private.chat_conversations c
    left join private.chat_conversation_members own_member
      on own_member.conversation_id = c.id
      and own_member.user_id = p_actor_user_id
    left join lateral (
      select max(m.created_at) as latest_at
      from private.chat_messages m
      where m.conversation_id = c.id
        and m.deleted_at is null
    ) latest on true
    where (
        c.ws_id = p_ws_id
        or (
          c.type in ('direct', 'group')
          and private.chat_is_actor_personal_workspace(p_ws_id, p_actor_user_id)
        )
      )
      and (
        (
          v_archived in ('active', 'all')
          and c.archived_at is null
          and private.chat_actor_can_access_conversation(c.id, p_actor_user_id)
        )
        or (
          v_archived in ('archived', 'all')
          and c.type in ('direct', 'group')
          and own_member.archived_at is not null
        )
      )
  );
end;
$$;

revoke all on function private.chat_list_conversations(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.chat_list_conversations(uuid, uuid, text) to service_role;
