-- Chat user safety: blocks and content reports (Apple 1.2, Play UGC policy).
--
-- Shape:
--   * private.chat_user_blocks          one row per (blocker, blocked) pair
--   * private.chat_users_blocked(a, b)  true when either side blocked the other
--   * private.chat_can_invite_user      redefined: a blocked pair can't invite
--                                       each other into DMs or groups
--   * chat_messages insert guard        refuses a user message in a direct
--                                       conversation between a blocked pair,
--                                       on every insert path
--   * chat_friend_requests guards       silently drop new requests between a
--                                       blocked pair (keeps the email-lookup
--                                       privacy contract) and refuse accepting
--   * private.chat_content_reports      user, message and Mira-response
--                                       reports for staff review
--
-- Every function is service_role only; the Web API binds p_actor_user_id to
-- the verified session user. Product decision and scope:
-- apps/docs/platform/chat-safety-and-ai-consent.mdx.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table private.chat_user_blocks (
  blocker_user_id uuid not null references public.users(id) on update cascade on delete cascade,
  blocked_user_id uuid not null references public.users(id) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  constraint chat_user_blocks_not_self check (blocker_user_id <> blocked_user_id)
);

create index chat_user_blocks_blocked_idx
  on private.chat_user_blocks (blocked_user_id, blocker_user_id);

alter table private.chat_user_blocks enable row level security;
revoke all on table private.chat_user_blocks from public, anon, authenticated;
grant select, insert, delete on table private.chat_user_blocks to service_role;
create policy chat_user_blocks_service_all
  on private.chat_user_blocks
  for all to service_role using (true) with check (true);

create function private.chat_users_blocked(
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select exists (
    select 1
    from private.chat_user_blocks b
    where (b.blocker_user_id = p_user_a and b.blocked_user_id = p_user_b)
       or (b.blocker_user_id = p_user_b and b.blocked_user_id = p_user_a)
  );
$$;

revoke all on function private.chat_users_blocked(uuid, uuid) from public, anon, authenticated;
grant execute on function private.chat_users_blocked(uuid, uuid) to service_role;

create or replace function private.chat_can_invite_user(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select
    p_target_user_id <> p_actor_user_id
    and not private.chat_users_blocked(p_actor_user_id, p_target_user_id)
    and (
      private.chat_users_share_workspace(p_actor_user_id, p_target_user_id)
      or private.chat_users_are_friends(p_actor_user_id, p_target_user_id)
    );
$$;

revoke all on function private.chat_can_invite_user(uuid, uuid) from public, anon, authenticated;
grant execute on function private.chat_can_invite_user(uuid, uuid) to service_role;

-- A user message in a direct conversation between a blocked pair is refused
-- whichever RPC inserts it (send, idempotent send, first-message creation).
create function private.chat_guard_blocked_direct_message()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if new.kind <> 'user' or new.sender_id is null then
    return new;
  end if;

  if exists (
    select 1
    from private.chat_conversations c
    join private.chat_conversation_members m
      on m.conversation_id = c.id
     and m.user_id <> new.sender_id
    where c.id = new.conversation_id
      and c.type = 'direct'
      and private.chat_users_blocked(new.sender_id, m.user_id)
  ) then
    raise exception 'chat_blocked'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.chat_guard_blocked_direct_message() from public, anon, authenticated, service_role;
-- tuturuuu: no-grant (trigger)

create trigger chat_messages_block_guard
  before insert on private.chat_messages
  for each row
  execute function private.chat_guard_blocked_direct_message();

-- New friend requests between a blocked pair are dropped without an error, so
-- chat_create_friend_request_by_email still answers {queued:true} and never
-- reveals the block. Accepting across a block is refused.
create function private.chat_guard_blocked_friend_request()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if not private.chat_users_blocked(new.requester_user_id, new.recipient_user_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    return null;
  end if;

  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    raise exception 'chat_blocked'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.chat_guard_blocked_friend_request() from public, anon, authenticated, service_role;
-- tuturuuu: no-grant (trigger)

create trigger chat_friend_requests_block_guard
  before insert or update on private.chat_friend_requests
  for each row
  execute function private.chat_guard_blocked_friend_request();

create function private.chat_block_user(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if p_actor_user_id is null or p_target_user_id is null then
    raise exception 'chat_block_target_invalid'
      using errcode = '22023';
  end if;

  if p_actor_user_id = p_target_user_id then
    raise exception 'chat_block_self_invalid'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.users u where u.id = p_target_user_id) then
    raise exception 'chat_block_target_not_found'
      using errcode = 'P0002';
  end if;

  if (
    select count(*) from private.chat_user_blocks b
    where b.blocker_user_id = p_actor_user_id
  ) >= 2000 then
    raise exception 'chat_block_limit_reached'
      using errcode = '22023';
  end if;

  insert into private.chat_user_blocks (blocker_user_id, blocked_user_id)
  values (p_actor_user_id, p_target_user_id)
  on conflict do nothing;

  -- Blocking ends the friendship and any pending request in both directions.
  update private.chat_friend_requests request
  set status = 'declined',
      responded_at = now()
  where request.status in ('pending', 'accepted')
    and (
      (request.requester_user_id = p_actor_user_id and request.recipient_user_id = p_target_user_id)
      or (request.requester_user_id = p_target_user_id and request.recipient_user_id = p_actor_user_id)
    );

  return jsonb_build_object('blocked', true, 'userId', p_target_user_id);
end;
$$;

revoke all on function private.chat_block_user(uuid, uuid) from public, anon, authenticated;
grant execute on function private.chat_block_user(uuid, uuid) to service_role;

create function private.chat_unblock_user(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if p_actor_user_id is null or p_target_user_id is null then
    raise exception 'chat_block_target_invalid'
      using errcode = '22023';
  end if;

  delete from private.chat_user_blocks b
  where b.blocker_user_id = p_actor_user_id
    and b.blocked_user_id = p_target_user_id;

  return jsonb_build_object('blocked', false, 'userId', p_target_user_id);
end;
$$;

revoke all on function private.chat_unblock_user(uuid, uuid) from public, anon, authenticated;
grant execute on function private.chat_unblock_user(uuid, uuid) to service_role;

-- Only the people the actor blocked, with the actor-visible public profile.
create function private.chat_list_blocked_users(
  p_actor_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'userId', b.blocked_user_id,
        'displayName', coalesce(u.display_name, u.handle),
        'avatarUrl', u.avatar_url,
        'createdAt', b.created_at
      )
      order by b.created_at desc
    ),
    '[]'::jsonb
  )
  from private.chat_user_blocks b
  left join public.users u on u.id = b.blocked_user_id
  where b.blocker_user_id = p_actor_user_id;
$$;

revoke all on function private.chat_list_blocked_users(uuid) from public, anon, authenticated;
grant execute on function private.chat_list_blocked_users(uuid) to service_role;

-- Content reports ----------------------------------------------------------

create table private.chat_content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid references public.users(id) on update cascade on delete set null,
  ws_id uuid references public.workspaces(id) on delete set null,
  subject_type text not null,
  reported_user_id uuid references public.users(id) on update cascade on delete set null,
  conversation_id uuid references private.chat_conversations(id) on delete set null,
  message_id uuid references private.chat_messages(id) on delete set null,
  ai_chat_id uuid references public.ai_chats(id) on delete set null,
  ai_chat_message_id uuid references public.ai_chat_messages(id) on delete set null,
  reason text not null,
  details text,
  snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  reviewed_by uuid references public.users(id) on update cascade on delete set null,
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_content_reports_subject_check check (
    subject_type in ('user', 'message', 'ai_response')
  ),
  constraint chat_content_reports_reason_check check (
    reason in ('spam', 'harassment', 'hate', 'sexual', 'violence',
               'impersonation', 'self_harm', 'harmful', 'inaccurate', 'other')
  ),
  constraint chat_content_reports_status_check check (
    status in ('open', 'reviewing', 'actioned', 'dismissed')
  ),
  constraint chat_content_reports_details_length check (
    details is null or char_length(details) <= 1000
  ),
  constraint chat_content_reports_note_length check (
    resolution_note is null or char_length(resolution_note) <= 2000
  )
);

create index chat_content_reports_status_created_idx
  on private.chat_content_reports (status, created_at desc);

create index chat_content_reports_reporter_created_idx
  on private.chat_content_reports (reporter_user_id, created_at desc);

-- One open report per reporter and subject; a repeat returns the same report.
create unique index chat_content_reports_open_subject_unique
  on private.chat_content_reports (
    reporter_user_id,
    subject_type,
    coalesce(message_id, ai_chat_message_id, reported_user_id)
  )
  where status in ('open', 'reviewing');

drop trigger if exists chat_content_reports_updated_at on private.chat_content_reports;
create trigger chat_content_reports_updated_at
  before update on private.chat_content_reports
  for each row
  execute function private.chat_set_updated_at();

alter table private.chat_content_reports enable row level security;
revoke all on table private.chat_content_reports from public, anon, authenticated;
grant select, insert, update on table private.chat_content_reports to service_role;
create policy chat_content_reports_service_all
  on private.chat_content_reports
  for all to service_role using (true) with check (true);

create function private.chat_submit_content_report(
  p_actor_user_id uuid,
  p_ws_id uuid,
  p_subject_type text,
  p_reported_user_id uuid,
  p_conversation_id uuid,
  p_message_id uuid,
  p_ai_chat_id uuid,
  p_reason text,
  p_details text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_message record;
  v_reported_user_id uuid := p_reported_user_id;
  v_conversation_id uuid := null;
  v_message_id uuid := null;
  v_ai_chat_id uuid := null;
  v_ai_chat_message_id uuid := null;
  v_snapshot jsonb := '{}'::jsonb;
  v_previous text;
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_report_id uuid;
begin
  if p_actor_user_id is null then
    raise exception 'chat_report_actor_required'
      using errcode = '42501';
  end if;

  if p_subject_type is null or p_subject_type not in ('user', 'message', 'ai_response') then
    raise exception 'chat_report_subject_invalid'
      using errcode = '22023';
  end if;

  if v_details is not null and char_length(v_details) > 1000 then
    raise exception 'chat_report_details_invalid'
      using errcode = '22023';
  end if;

  if (
    select count(*) from private.chat_content_reports r
    where r.reporter_user_id = p_actor_user_id
      and r.created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception 'chat_report_rate_limited'
      using errcode = '54000';
  end if;

  if p_subject_type = 'ai_response' and p_ai_chat_id is not null then
    -- Mira conversations live in public.ai_chats; only the chat's creator
    -- can see (and so report) its responses.
    select m.id, m.chat_id, m.content, m.model, m.created_at
    into v_message
    from public.ai_chat_messages m
    join public.ai_chats c on c.id = m.chat_id
    where m.id = p_message_id
      and m.chat_id = p_ai_chat_id
      and c.creator_id = p_actor_user_id
      and m.role = 'ASSISTANT';

    if not found then
      raise exception 'chat_report_message_not_found'
        using errcode = 'P0002';
    end if;

    select prev.content
    into v_previous
    from public.ai_chat_messages prev
    where prev.chat_id = v_message.chat_id
      and prev.role = 'USER'
      and prev.created_at <= v_message.created_at
    order by prev.created_at desc
    limit 1;

    v_ai_chat_id := v_message.chat_id;
    v_ai_chat_message_id := v_message.id;
    v_snapshot := jsonb_build_object(
      'kind', 'assistant',
      'content', left(coalesce(v_message.content, ''), 10000),
      'model', v_message.model,
      'messageCreatedAt', v_message.created_at,
      'previousUserContent', left(v_previous, 4000)
    );
  elsif p_subject_type in ('message', 'ai_response') then
    if p_conversation_id is null or p_message_id is null then
      raise exception 'chat_report_message_invalid'
        using errcode = '22023';
    end if;

    select m.id, m.conversation_id, m.sender_id, m.kind, m.content, m.created_at
    into v_message
    from private.chat_messages m
    join private.chat_conversations c on c.id = m.conversation_id
    where m.id = p_message_id
      and m.conversation_id = p_conversation_id
      and c.ws_id = p_ws_id
      and m.deleted_at is null;

    if not found
      or not private.chat_actor_can_access_conversation(p_conversation_id, p_actor_user_id) then
      raise exception 'chat_report_message_not_found'
        using errcode = 'P0002';
    end if;

    if p_subject_type = 'message' then
      if v_message.kind <> 'user'
        or v_message.sender_id is null
        or v_message.sender_id = p_actor_user_id then
        raise exception 'chat_report_message_invalid'
          using errcode = '22023';
      end if;
      v_reported_user_id := v_message.sender_id;
    else
      if v_message.kind <> 'assistant' then
        raise exception 'chat_report_message_invalid'
          using errcode = '22023';
      end if;
      v_reported_user_id := null;

      select prev.content
      into v_previous
      from private.chat_messages prev
      where prev.conversation_id = v_message.conversation_id
        and prev.kind = 'user'
        and prev.deleted_at is null
        and prev.created_at <= v_message.created_at
        and prev.id <> v_message.id
      order by prev.created_at desc
      limit 1;
    end if;

    v_conversation_id := v_message.conversation_id;
    v_message_id := v_message.id;
    -- The server captures the content, so a report can't be forged from
    -- client-supplied text and survives a later edit or delete.
    v_snapshot := jsonb_build_object(
      'kind', v_message.kind,
      'content', left(v_message.content, 10000),
      'senderId', v_message.sender_id,
      'messageCreatedAt', v_message.created_at,
      'previousUserContent', left(v_previous, 4000)
    );
  else
    if v_reported_user_id is null or v_reported_user_id = p_actor_user_id then
      raise exception 'chat_report_target_invalid'
        using errcode = '22023';
    end if;

    -- Only people the reporter can actually meet in chat can be reported.
    if not (
      private.chat_users_share_workspace(p_actor_user_id, v_reported_user_id)
      or exists (
        select 1 from private.chat_friend_requests request
        where (request.requester_user_id = p_actor_user_id and request.recipient_user_id = v_reported_user_id)
           or (request.requester_user_id = v_reported_user_id and request.recipient_user_id = p_actor_user_id)
      )
      or exists (
        select 1
        from private.chat_conversation_members mine
        join private.chat_conversation_members theirs
          on theirs.conversation_id = mine.conversation_id
         and theirs.user_id = v_reported_user_id
        where mine.user_id = p_actor_user_id
      )
    ) then
      raise exception 'chat_report_target_invalid'
        using errcode = '42501';
    end if;
  end if;

  if p_reason is null or p_reason not in (
    'spam', 'harassment', 'hate', 'sexual', 'violence',
    'impersonation', 'self_harm', 'harmful', 'inaccurate', 'other'
  ) then
    raise exception 'chat_report_reason_invalid'
      using errcode = '22023';
  end if;

  select r.id
  into v_report_id
  from private.chat_content_reports r
  where r.reporter_user_id = p_actor_user_id
    and r.subject_type = p_subject_type
    and coalesce(r.message_id, r.ai_chat_message_id, r.reported_user_id)
      = coalesce(v_message_id, v_ai_chat_message_id, v_reported_user_id)
    and r.status in ('open', 'reviewing')
  limit 1;

  if v_report_id is not null then
    return jsonb_build_object('reportId', v_report_id, 'duplicate', true);
  end if;

  insert into private.chat_content_reports (
    reporter_user_id, ws_id, subject_type, reported_user_id,
    conversation_id, message_id, ai_chat_id, ai_chat_message_id,
    reason, details, snapshot
  )
  values (
    p_actor_user_id, p_ws_id, p_subject_type, v_reported_user_id,
    v_conversation_id, v_message_id, v_ai_chat_id, v_ai_chat_message_id,
    p_reason, v_details, v_snapshot
  )
  returning id into v_report_id;

  return jsonb_build_object(
    'reportId', v_report_id,
    'duplicate', false,
    'reportedUserId', v_reported_user_id
  );
end;
$$;

revoke all on function private.chat_submit_content_report(uuid, uuid, text, uuid, uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function private.chat_submit_content_report(uuid, uuid, text, uuid, uuid, uuid, uuid, text, text)
  to service_role;

-- Staff review (the Web API gates callers to verified Tuturuuu staff).
create function private.chat_list_content_reports(
  p_status text,
  p_limit integer
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb)
  from (
    select
      r.created_at,
      jsonb_build_object(
        'id', r.id,
        'subjectType', r.subject_type,
        'reason', r.reason,
        'details', r.details,
        'status', r.status,
        'snapshot', r.snapshot,
        'wsId', r.ws_id,
        'conversationId', r.conversation_id,
        'messageId', r.message_id,
        'aiChatId', r.ai_chat_id,
        'aiChatMessageId', r.ai_chat_message_id,
        'reporterUserId', r.reporter_user_id,
        'reporterName', coalesce(reporter.display_name, reporter.handle),
        'reportedUserId', r.reported_user_id,
        'reportedName', coalesce(reported.display_name, reported.handle),
        'reviewedAt', r.reviewed_at,
        'resolutionNote', r.resolution_note,
        'createdAt', r.created_at
      ) as row_json
    from private.chat_content_reports r
    left join public.users reporter on reporter.id = r.reporter_user_id
    left join public.users reported on reported.id = r.reported_user_id
    where p_status is null or r.status = p_status
    order by r.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ) listed;
$$;

revoke all on function private.chat_list_content_reports(text, integer) from public, anon, authenticated;
grant execute on function private.chat_list_content_reports(text, integer) to service_role;

create function private.chat_review_content_report(
  p_report_id uuid,
  p_reviewer_user_id uuid,
  p_status text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_status is null or p_status not in ('reviewing', 'actioned', 'dismissed') then
    raise exception 'chat_report_status_invalid'
      using errcode = '22023';
  end if;

  update private.chat_content_reports r
  set status = p_status,
      reviewed_by = p_reviewer_user_id,
      reviewed_at = now(),
      resolution_note = nullif(btrim(coalesce(p_note, '')), '')
  where r.id = p_report_id
  returning r.id into v_id;

  if v_id is null then
    raise exception 'chat_report_not_found'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object('id', v_id, 'status', p_status);
end;
$$;

revoke all on function private.chat_review_content_report(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function private.chat_review_content_report(uuid, uuid, text, text) to service_role;

commit;
