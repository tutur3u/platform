begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- The actor mutes only their own membership. Another member's row, the
-- conversation role, and pin or archive state stay as they are.
create or replace function private.chat_set_own_mute(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_muted boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '5s'
set statement_timeout = '30s'
as $$
#variable_conflict use_column
declare
  v_conversation private.chat_conversations%rowtype;
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  select *
  into v_conversation
  from private.chat_conversations
  where id = p_conversation_id
    and archived_at is null
    and private.chat_can_address_conversation_workspace(
      p_ws_id,
      ws_id,
      type,
      p_actor_user_id
    );

  if v_conversation.id is null then
    raise exception 'chat_conversation_not_found'
      using errcode = 'P0002';
  end if;

  if not private.chat_actor_can_access_conversation(
    p_conversation_id,
    p_actor_user_id
  ) then
    raise exception 'chat_conversation_forbidden'
      using errcode = '42501';
  end if;

  if p_muted then
    insert into private.chat_conversation_members (
      conversation_id,
      user_id,
      role,
      muted_at
    )
    values (
      p_conversation_id,
      p_actor_user_id,
      'member',
      now()
    )
    on conflict (conversation_id, user_id) do update
    set muted_at = coalesce(
      private.chat_conversation_members.muted_at,
      now()
    );
  else
    update private.chat_conversation_members
    set muted_at = null
    where conversation_id = p_conversation_id
      and user_id = p_actor_user_id;
  end if;

  insert into private.chat_audit_events (
    ws_id,
    conversation_id,
    actor_id,
    event_type,
    metadata
  )
  values (
    v_conversation.ws_id,
    p_conversation_id,
    p_actor_user_id,
    'conversation.updated',
    jsonb_build_object(
      'hasMuted',
      true,
      'muted',
      p_muted,
      'type',
      v_conversation.type
    )
  );

  return private.chat_conversation_json(p_conversation_id, p_actor_user_id);
end;
$$;

revoke all on function private.chat_set_own_mute(uuid, uuid, uuid, boolean)
  from public, anon, authenticated;

grant execute on function private.chat_set_own_mute(uuid, uuid, uuid, boolean)
  to service_role;

commit;
