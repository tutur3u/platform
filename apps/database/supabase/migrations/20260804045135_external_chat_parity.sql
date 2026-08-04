-- Generic parity state for external chat replicas. Connector-specific fields stay
-- inside sanitized JSON payloads and are never exposed through authenticated grants.

alter table private.external_chat_events
  add column event_kind text not null default 'message',
  add column delivery_mode text not null default 'live',
  add column source_digest text,
  add column deleted_at timestamptz;

alter table private.external_chat_events
  add constraint external_chat_events_kind_check check (
    event_kind in ('message', 'message_state', 'message_deleted')
  ) not valid,
  add constraint external_chat_events_delivery_mode_check check (
    delivery_mode in ('live', 'historical', 'probe')
  ) not valid,
  add constraint external_chat_events_source_digest_check check (
    source_digest is null or char_length(source_digest) = 64
  ) not valid;

create table private.external_chat_source_events (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspace_external_project_bindings(ws_id) on delete cascade,
  connector_key text not null,
  source_event_id text not null,
  source_record_id text not null,
  event_kind text not null,
  delivery_mode text not null,
  payload_digest text not null,
  thread_id uuid,
  result jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint external_chat_source_events_identity_key
    unique (ws_id, connector_key, source_event_id),
  constraint external_chat_source_events_kind_check check (
    event_kind in (
      'message', 'message_state', 'message_deleted', 'observation',
      'presence', 'typing'
    )
  ),
  constraint external_chat_source_events_delivery_mode_check check (
    delivery_mode in ('live', 'historical', 'probe')
  ),
  constraint external_chat_source_events_digest_check check (
    char_length(payload_digest) = 64
  ),
  constraint external_chat_source_events_thread_scope_fk
    foreign key (thread_id, ws_id)
    references private.external_chat_threads(id, ws_id) on delete cascade
);

create table private.external_chat_observations (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspace_external_project_bindings(ws_id) on delete cascade,
  thread_id uuid not null,
  connector_key text not null,
  remote_observation_id text not null,
  category text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint external_chat_observations_identity_key
    unique (ws_id, connector_key, remote_observation_id),
  constraint external_chat_observations_category_length check (
    char_length(category) between 1 and 80
  ),
  constraint external_chat_observations_payload_object check (
    jsonb_typeof(payload) = 'object'
  ),
  constraint external_chat_observations_thread_scope_fk
    foreign key (thread_id, ws_id, connector_key)
    references private.external_chat_threads(id, ws_id, connector_key) on delete cascade
);

create table private.external_chat_sync_runs (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspace_external_project_bindings(ws_id) on delete cascade,
  connector_key text not null,
  operation text not null,
  state text not null default 'pending',
  high_water_mark jsonb not null default '{}'::jsonb,
  cursor jsonb not null default '{}'::jsonb,
  source_counts jsonb not null default '{}'::jsonb,
  target_counts jsonb not null default '{}'::jsonb,
  digest_results jsonb not null default '[]'::jsonb,
  diagnostics jsonb not null default '{}'::jsonb,
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_chat_sync_runs_operation_check check (
    operation in ('audit', 'backfill', 'reconcile')
  ),
  constraint external_chat_sync_runs_state_check check (
    state in ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')
  )
);

create table private.external_chat_stream_cursors (
  ws_id uuid not null references public.workspace_external_project_bindings(ws_id) on delete cascade,
  connector_key text not null,
  stream_key text not null,
  cursor jsonb not null default '{}'::jsonb,
  high_water_mark jsonb not null default '{}'::jsonb,
  retry_count integer not null default 0,
  dead_letter_count bigint not null default 0,
  last_error_code text,
  updated_at timestamptz not null default now(),
  primary key (ws_id, connector_key, stream_key),
  constraint external_chat_stream_cursors_retry_check check (retry_count >= 0),
  constraint external_chat_stream_cursors_dead_letter_check check (dead_letter_count >= 0)
);

create index external_chat_source_events_thread_time_idx
  on private.external_chat_source_events (thread_id, occurred_at desc);
create index external_chat_observations_thread_time_idx
  on private.external_chat_observations (thread_id, occurred_at desc);
create index external_chat_sync_runs_workspace_time_idx
  on private.external_chat_sync_runs (ws_id, created_at desc);

alter table private.external_chat_source_events enable row level security;
alter table private.external_chat_observations enable row level security;
alter table private.external_chat_sync_runs enable row level security;
alter table private.external_chat_stream_cursors enable row level security;

revoke all on table private.external_chat_source_events from public, anon, authenticated;
revoke all on table private.external_chat_observations from public, anon, authenticated;
revoke all on table private.external_chat_sync_runs from public, anon, authenticated;
revoke all on table private.external_chat_stream_cursors from public, anon, authenticated;
grant all on table private.external_chat_source_events to service_role;
grant all on table private.external_chat_observations to service_role;
grant all on table private.external_chat_sync_runs to service_role;
grant all on table private.external_chat_stream_cursors to service_role;

create or replace function private.external_chat_apply_message_state(
  p_ws_id uuid,
  p_connector_key text,
  p_remote_message_id text,
  p_status text,
  p_occurred_at timestamptz,
  p_deleted boolean default false,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_event private.external_chat_events%rowtype;
  v_state_occurred_at timestamptz;
begin
  if char_length(coalesce(p_status, '')) > 80
    or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'external_chat_invalid_state';
  end if;

  select * into v_event
  from private.external_chat_events
  where ws_id = p_ws_id
    and connector_key = p_connector_key
    and remote_message_id = p_remote_message_id
  for update;

  if v_event.id is null then
    return jsonb_build_object('found', false);
  end if;

  select nullif(metadata->>'stateOccurredAt', '')::timestamptz
  into v_state_occurred_at
  from private.chat_messages
  where id = v_event.message_id;

  if v_state_occurred_at is not null
    and v_state_occurred_at > coalesce(p_occurred_at, now()) then
    return jsonb_build_object(
      'found', true,
      'message', (
        select private.chat_message_json(message_row)
        from private.chat_messages message_row
        where message_row.id = v_event.message_id
      ),
      'messageId', v_event.message_id,
      'stale', true,
      'threadId', v_event.thread_id
    );
  end if;

  update private.external_chat_events
  set metadata = metadata || coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object('status', p_status),
      event_kind = case when p_deleted then 'message_deleted' else 'message_state' end,
      deleted_at = case when p_deleted then coalesce(p_occurred_at, now()) else deleted_at end
  where id = v_event.id;

  update private.chat_messages
  set metadata = metadata || coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'status', p_status,
        'deleted', p_deleted,
        'stateOccurredAt', coalesce(p_occurred_at, now())
      ),
      content = case when p_deleted then '' else content end,
      deleted_at = case
        when p_deleted then coalesce(p_occurred_at, now())
        else deleted_at
      end
  where id = v_event.message_id;

  return jsonb_build_object(
    'found', true,
    'message', (
      select private.chat_message_json(message_row)
      from private.chat_messages message_row
      where message_row.id = v_event.message_id
    ),
    'messageId', v_event.message_id,
    'threadId', v_event.thread_id
  );
end;
$$;

revoke all on function private.external_chat_apply_message_state(
  uuid, text, text, text, timestamptz, boolean, jsonb
) from public, anon, authenticated;
grant execute on function private.external_chat_apply_message_state(
  uuid, text, text, text, timestamptz, boolean, jsonb
) to service_role;

create or replace function private.external_chat_upsert_observation(
  p_ws_id uuid,
  p_connector_key text,
  p_remote_agent_id text,
  p_remote_visitor_id text,
  p_remote_observation_id text,
  p_category text,
  p_payload jsonb,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_thread private.external_chat_threads%rowtype;
  v_observation_id uuid;
  v_conversation_id uuid;
  v_title text;
begin
  if char_length(coalesce(p_remote_agent_id, '')) > 255
    or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'external_chat_invalid_observation';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(':', p_ws_id::text, p_connector_key,
        coalesce(p_remote_agent_id, ''), p_remote_visitor_id),
      0
    )
  );

  select * into v_thread
  from private.external_chat_threads
  where ws_id = p_ws_id
    and connector_key = p_connector_key
    and remote_agent_id = coalesce(p_remote_agent_id, '')
    and remote_visitor_id = p_remote_visitor_id;

  if v_thread.id is null then
    v_title := left(nullif(p_payload->>'displayName', ''), 255);
    insert into private.chat_conversations (
      ws_id, type, title, metadata, created_at, updated_at
    ) values (
      p_ws_id, 'channel', coalesce(v_title, 'External visitor'),
      jsonb_build_object('externalChat', true, 'historicalProfile', true),
      p_occurred_at, p_occurred_at
    ) returning id into v_conversation_id;

    insert into private.external_chat_threads (
      ws_id, connector_key, remote_agent_id, remote_visitor_id,
      conversation_id, metadata
    ) values (
      p_ws_id, p_connector_key, coalesce(p_remote_agent_id, ''),
      p_remote_visitor_id, v_conversation_id,
      jsonb_strip_nulls(jsonb_build_object(
        'displayName', p_payload->>'displayName',
        'email', p_payload->>'email',
        'phone', p_payload->>'phone'
      ))
    ) returning * into v_thread;
  end if;

  insert into private.external_chat_observations (
    ws_id, thread_id, connector_key, remote_observation_id,
    category, payload, occurred_at
  ) values (
    p_ws_id, v_thread.id, p_connector_key, p_remote_observation_id,
    p_category, p_payload, p_occurred_at
  )
  on conflict (ws_id, connector_key, remote_observation_id) do update
  set category = excluded.category,
      payload = excluded.payload,
      occurred_at = excluded.occurred_at
  returning id into v_observation_id;

  return jsonb_build_object(
    'found', true,
    'observationId', v_observation_id,
    'threadId', v_thread.id
  );
end;
$$;

revoke all on function private.external_chat_upsert_observation(
  uuid, text, text, text, text, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function private.external_chat_upsert_observation(
  uuid, text, text, text, text, text, jsonb, timestamptz
) to service_role;

create or replace function private.external_chat_list_conversations(
  p_ws_id uuid,
  p_actor_user_id uuid,
  p_archived text default 'active',
  p_limit integer default 41,
  p_offset integer default 0
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
  v_limit integer := least(greatest(coalesce(p_limit, 41), 1), 101);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if coalesce(p_offset, 0) > 1000 then
    raise exception 'external_chat_offset_too_large' using errcode = '22023';
  end if;

  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  return (
    select coalesce(
      jsonb_agg(
        page.conversation
        order by
          page.pinned_at is null,
          page.pinned_at desc,
          page.latest_at desc,
          page.created_at desc,
          page.id asc
      ),
      '[]'::jsonb
    )
    from (
      select ranked.*
      from (
        select
          private.external_chat_conversation_json(c.id, p_actor_user_id)
            || jsonb_build_object(
              'archivedAt',
              (coalesce(c.archived_at, own_member.archived_at))::text
            ) as conversation,
          own_member.pinned_at,
          coalesce(latest.latest_at, c.updated_at) as latest_at,
          c.created_at,
          c.id
        from private.external_chat_threads external_thread
        join private.chat_conversations c
          on c.id = external_thread.conversation_id
          and external_thread.ws_id = p_ws_id
        left join private.chat_conversation_members own_member
          on own_member.conversation_id = c.id
          and own_member.user_id = p_actor_user_id
        left join lateral (
          select max(m.created_at) as latest_at
          from private.chat_messages m
          where m.conversation_id = c.id
            and m.deleted_at is null
        ) latest on true
        where private.chat_can_address_conversation_workspace(
            p_ws_id,
            c.ws_id,
            c.type,
            p_actor_user_id
          )
          and (
            not exists (
              select 1
              from private.external_chat_source_events source_event
              where source_event.thread_id = external_thread.id
            )
            or exists (
              select 1
              from private.external_chat_source_events source_event
              where source_event.thread_id = external_thread.id
                and source_event.delivery_mode <> 'probe'
            )
          )
          and (
            (
              v_archived in ('active', 'all')
              and c.archived_at is null
              and private.chat_actor_can_access_conversation(
                c.id,
                p_actor_user_id
              )
            )
            or (
              v_archived in ('archived', 'all')
              and (
                c.archived_at is not null
                or own_member.archived_at is not null
              )
            )
          )
      ) ranked
      order by
        ranked.pinned_at is null,
        ranked.pinned_at desc,
        ranked.latest_at desc,
        ranked.created_at desc,
        ranked.id asc
      limit v_limit
      offset v_offset
    ) page
  );
end;
$$;

revoke all on function private.external_chat_list_conversations(
  uuid, uuid, text, integer, integer
) from public, anon, authenticated;
grant execute on function private.external_chat_list_conversations(
  uuid, uuid, text, integer, integer
) to service_role;
