create table private.chat_reaction_operations (
  actor_user_id uuid not null references public.users(id) on delete cascade,
  op_id uuid not null,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references private.chat_conversations(id) on delete cascade,
  message_id uuid not null references private.chat_messages(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 64),
  present boolean not null,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, op_id)
);

create index chat_reaction_operations_ws_idx
  on private.chat_reaction_operations (ws_id);
create index chat_reaction_operations_conversation_idx
  on private.chat_reaction_operations (conversation_id);
create index chat_reaction_operations_message_idx
  on private.chat_reaction_operations (message_id);

alter table private.chat_reaction_operations enable row level security;
alter table private.chat_reaction_operations force row level security;
revoke all on table private.chat_reaction_operations from public, anon, authenticated, service_role;
grant select on table private.chat_reaction_operations to service_role;

create table private.chat_retired_reaction_operations (
  actor_user_id uuid not null references public.users(id) on delete cascade,
  op_id uuid not null,
  primary key (actor_user_id, op_id)
);

alter table private.chat_retired_reaction_operations enable row level security;
alter table private.chat_retired_reaction_operations force row level security;
revoke all on table private.chat_retired_reaction_operations from public, anon, authenticated, service_role;
grant select on table private.chat_retired_reaction_operations to service_role;

create function private.chat_retire_reaction_operations(
  p_actor_user_id uuid,
  p_op_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_op_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'chat_service_role_required' using errcode = '42501';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.users u where u.id = p_actor_user_id
  ) then
    raise exception 'chat_invalid_actor_context' using errcode = '42501';
  end if;
  if p_op_ids is null or coalesce(array_ndims(p_op_ids), 0) <> 1
    or cardinality(p_op_ids) not between 1 and 100 then
    raise exception 'chat_invalid_reaction_retirement' using errcode = '22023';
  end if;
  if array_position(p_op_ids, null) is not null then
    raise exception 'chat_invalid_reaction_retirement' using errcode = '22023';
  end if;

  for v_op_id in
    select distinct requested.op_id from unnest(p_op_ids) as requested(op_id)
    order by requested.op_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'chat-reaction-operation:' || p_actor_user_id::text || ':' || v_op_id::text, 0
    ));
    insert into private.chat_retired_reaction_operations (actor_user_id, op_id)
    values (p_actor_user_id, v_op_id)
    on conflict (actor_user_id, op_id) do nothing;
  end loop;

  return jsonb_build_object('retiredOpIds', (
    select jsonb_agg(o.op_id order by o.op_id)
    from private.chat_retired_reaction_operations o
    where o.actor_user_id = p_actor_user_id and o.op_id = any(p_op_ids)
  ));
end;
$$;

revoke all on function private.chat_retire_reaction_operations(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function private.chat_retire_reaction_operations(uuid, uuid[])
  to service_role;

create function private.chat_set_reaction(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_message_id uuid,
  p_actor_user_id uuid,
  p_emoji text,
  p_present boolean,
  p_op_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_emoji text := btrim(coalesce(p_emoji, ''));
  v_message private.chat_messages%rowtype;
  v_operation private.chat_reaction_operations%rowtype;
  v_new_operation boolean;
  v_retired boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'chat_service_role_required' using errcode = '42501';
  end if;

  perform private.chat_assert_workspace_permission(
    p_ws_id, p_actor_user_id, 'view_chat'
  );
  if private.chat_get_conversation(
    p_ws_id, p_conversation_id, p_actor_user_id
  ) is null then
    raise exception 'chat_conversation_not_found' using errcode = '22023';
  end if;
  if p_op_id is null or p_present is null
    or char_length(v_emoji) not between 1 and 64 then
    raise exception 'chat_invalid_reaction_operation' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'chat-reaction-operation:' || p_actor_user_id::text || ':' || p_op_id::text, 0
  ));
  select exists (
    select 1 from private.chat_retired_reaction_operations o
    where o.actor_user_id = p_actor_user_id and o.op_id = p_op_id
  ) into v_retired;

  -- Retirement locks precede message locks; retire never locks a message.
  select m.* into v_message
  from private.chat_messages m
  where m.id = p_message_id
    and m.conversation_id = p_conversation_id
    and m.deleted_at is null
  for update;
  if not found then
    raise exception 'chat_message_not_found' using errcode = '22023';
  end if;

  insert into private.chat_reaction_operations (
    actor_user_id, op_id, ws_id, conversation_id, message_id, emoji, present
  ) values (
    p_actor_user_id, p_op_id, p_ws_id, p_conversation_id,
    p_message_id, v_emoji, p_present
  ) on conflict (actor_user_id, op_id) do nothing;
  v_new_operation := found;

  select o.* into strict v_operation
  from private.chat_reaction_operations o
  where o.actor_user_id = p_actor_user_id and o.op_id = p_op_id;
  if v_operation.ws_id is distinct from p_ws_id
    or v_operation.conversation_id is distinct from p_conversation_id
    or v_operation.message_id is distinct from p_message_id
    or v_operation.emoji is distinct from v_emoji
    or v_operation.present is distinct from p_present then
    raise exception 'chat_reaction_operation_mismatch' using errcode = '22023';
  end if;

  if v_new_operation and not v_retired then
    if p_present then
      insert into private.chat_message_reactions (message_id, user_id, emoji)
      values (p_message_id, p_actor_user_id, v_emoji)
      on conflict (message_id, user_id, emoji) do nothing;
    else
      delete from private.chat_message_reactions r
      where r.message_id = p_message_id
        and r.user_id = p_actor_user_id and r.emoji = v_emoji;
    end if;
  end if;

  return jsonb_build_object(
    'message', private.chat_message_json(v_message),
    'operation', jsonb_build_object(
      'id', v_operation.op_id,
      'emoji', v_operation.emoji,
      'present', v_operation.present
    )
  );
end;
$$;

revoke all on function private.chat_set_reaction(uuid, uuid, uuid, uuid, text, boolean, uuid)
  from public, anon, authenticated;
grant execute on function private.chat_set_reaction(uuid, uuid, uuid, uuid, text, boolean, uuid)
  to service_role;

create function private.chat_get_reaction_message(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_message_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'chat_service_role_required' using errcode = '42501';
  end if;
  if private.chat_get_conversation(
    p_ws_id, p_conversation_id, p_actor_user_id
  ) is null then
    return null;
  end if;

  return (
    select private.chat_message_json(m)
    from private.chat_messages m
    where m.id = p_message_id
      and m.conversation_id = p_conversation_id
      and m.deleted_at is null
  );
end;
$$;

revoke all on function private.chat_get_reaction_message(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.chat_get_reaction_message(uuid, uuid, uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';
