create table if not exists private.ai_agent_external_message_attachments (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references private.ai_agent_external_threads(id) on delete cascade,
  message_id uuid not null references private.ai_agent_external_messages(id) on delete cascade,
  filename text not null,
  content_type text,
  size_bytes bigint,
  storage_path text not null,
  full_path text,
  created_at timestamptz not null default now(),
  constraint ai_agent_external_message_attachments_filename_check check (
    char_length(filename) between 1 and 240
  ),
  constraint ai_agent_external_message_attachments_storage_path_check check (
    char_length(storage_path) between 1 and 1024
  ),
  constraint ai_agent_external_message_attachments_size_check check (
    size_bytes is null or size_bytes between 0 and 26214400
  ),
  unique (message_id, storage_path)
);

create index if not exists ai_agent_external_message_attachments_message_idx
  on private.ai_agent_external_message_attachments (message_id, created_at);

alter table private.ai_agent_external_message_attachments enable row level security;
revoke all on table private.ai_agent_external_message_attachments
  from public, anon, authenticated;
grant all on table private.ai_agent_external_message_attachments to service_role;

create or replace function private.ai_agent_external_attachment_json(
  p_attachment private.ai_agent_external_message_attachments
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'contentType', p_attachment.content_type,
    'conversationId', private.ai_agent_external_conversation_id(p_attachment.thread_id),
    'createdAt', p_attachment.created_at,
    'filename', p_attachment.filename,
    'fullPath', p_attachment.full_path,
    'id', p_attachment.id,
    'messageId', p_attachment.message_id,
    'sizeBytes', p_attachment.size_bytes,
    'storagePath', p_attachment.storage_path,
    'storageWsId', t.ws_id,
    'uploaderId', null
  )
  from private.ai_agent_external_threads t
  where t.id = p_attachment.thread_id;
$$;

create or replace function private.ai_agent_external_message_json(
  p_message private.ai_agent_external_messages
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'attachments', coalesce((
      select jsonb_agg(
        private.ai_agent_external_attachment_json(a.*)
        order by a.created_at, a.id
      )
      from private.ai_agent_external_message_attachments a
      where a.message_id = p_message.id
    ), '[]'::jsonb),
    'content', p_message.content,
    'conversationId', private.ai_agent_external_conversation_id(p_message.thread_id),
    'createdAt', p_message.external_created_at,
    'deletedAt', null,
    'editedAt', null,
    'id', p_message.id,
    'kind', p_message.kind,
    'metadata', p_message.metadata || jsonb_build_object(
      'direction', p_message.direction,
      'externalMessageId', p_message.external_message_id,
      'source', 'ai-agent-external-thread'
    ),
    'reactions', '[]'::jsonb,
    'replyToMessageId', null,
    'sender', case
      when p_message.author_display_name is null
        and p_message.author_external_id is null
      then null
      else jsonb_build_object(
        'avatarUrl', p_message.author_avatar_url,
        'displayName', coalesce(
          p_message.author_display_name,
          p_message.author_external_id,
          'External user'
        ),
        'handle', p_message.author_external_id,
        'id', coalesce(
          p_message.platform_user_id::text,
          p_message.author_external_id,
          p_message.id::text
        )
      )
    end,
    'senderId', p_message.platform_user_id,
    'updatedAt', p_message.updated_at
  );
$$;

create or replace function private.ai_agent_external_upsert_attachment(
  p_attachment_id uuid,
  p_thread_id uuid,
  p_message_id uuid,
  p_filename text,
  p_content_type text,
  p_size_bytes bigint,
  p_storage_path text,
  p_full_path text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_attachment private.ai_agent_external_message_attachments;
begin
  if not exists (
    select 1
    from private.ai_agent_external_messages m
    where m.id = p_message_id
      and m.thread_id = p_thread_id
  ) then
    raise exception 'ai_agent_external_message_not_found'
      using errcode = '22023';
  end if;

  insert into private.ai_agent_external_message_attachments (
    id,
    thread_id,
    message_id,
    filename,
    content_type,
    size_bytes,
    storage_path,
    full_path
  )
  values (
    p_attachment_id,
    p_thread_id,
    p_message_id,
    p_filename,
    p_content_type,
    p_size_bytes,
    p_storage_path,
    p_full_path
  )
  on conflict (message_id, storage_path) do update
  set filename = excluded.filename,
      content_type = excluded.content_type,
      size_bytes = excluded.size_bytes,
      full_path = excluded.full_path
  returning * into v_attachment;

  return private.ai_agent_external_attachment_json(v_attachment);
end;
$$;

create or replace function private.ai_agent_external_get_attachment(
  p_ws_id uuid,
  p_conversation_id text,
  p_actor_user_id uuid,
  p_attachment_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_attachment private.ai_agent_external_message_attachments;
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  select a.*
  into v_attachment
  from private.ai_agent_external_message_attachments a
  join private.ai_agent_external_threads t
    on t.id = a.thread_id
   and t.ws_id = p_ws_id
  where a.id = p_attachment_id
    and private.ai_agent_external_conversation_id(t.id) = p_conversation_id
  limit 1;

  if v_attachment.id is null then
    raise exception 'chat_attachment_not_found'
      using errcode = '22023';
  end if;

  return private.ai_agent_external_attachment_json(v_attachment);
end;
$$;

revoke all on function private.ai_agent_external_attachment_json(
  private.ai_agent_external_message_attachments
) from public, anon, authenticated;
revoke all on function private.ai_agent_external_upsert_attachment(
  uuid, uuid, uuid, text, text, bigint, text, text
) from public, anon, authenticated;
revoke all on function private.ai_agent_external_get_attachment(
  uuid, text, uuid, uuid
) from public, anon, authenticated;

grant execute on function private.ai_agent_external_attachment_json(
  private.ai_agent_external_message_attachments
) to service_role;
grant execute on function private.ai_agent_external_upsert_attachment(
  uuid, uuid, uuid, text, text, bigint, text, text
) to service_role;
grant execute on function private.ai_agent_external_get_attachment(
  uuid, text, uuid, uuid
) to service_role;
