-- Chat user safety: blocks (Apple 1.2, Play UGC policy). Reports live in
-- 20261128170500_chat_content_reports.sql.
--
-- Shape:
--   * private.chat_user_blocks          one row per (blocker, blocked) pair
--   * private.chat_users_blocked(a, b)  true when either side blocked the other
--   * private.chat_can_invite_user      redefined: a blocked pair can't invite
--                                       each other into DMs or groups
--   * frozen direct conversations       a DM between a blocked pair takes no
--                                       new message of any kind, edit or
--                                       reaction, on every write path
--   * private.chat_users_can_meet       the relation that allows a block or
--                                       a user report
--   * chat_friend_requests guards       silently drop new requests between a
--                                       blocked pair (keeps the email-lookup
--                                       privacy contract) and refuse accepting
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

-- A direct conversation between a blocked pair is frozen: no new message of
-- any kind (user, assistant, system), no edit, no restore and no new
-- reaction, whichever RPC writes it. Soft deletes stay allowed so people can
-- remove their own words, and so do removing their own reactions and the
-- foreign-key cleanups that null a sender or reply target.
create function private.chat_direct_conversation_blocked(
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select exists (
    select 1
    from private.chat_conversations c
    join private.chat_conversation_members a
      on a.conversation_id = c.id
    join private.chat_conversation_members b
      on b.conversation_id = c.id
     and b.user_id > a.user_id
    where c.id = p_conversation_id
      and c.type = 'direct'
      and private.chat_users_blocked(a.user_id, b.user_id)
  );
$$;

revoke all on function private.chat_direct_conversation_blocked(uuid) from public, anon, authenticated;
grant execute on function private.chat_direct_conversation_blocked(uuid) to service_role;

create function private.chat_guard_blocked_direct_message()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  -- Updates that add no words pass: the soft delete written by
  -- private.chat_delete_message (content '' plus deleted_at/updated_at), and
  -- changes that leave content and deleted_at alone, such as the FK
  -- ON DELETE SET NULL of sender_id or reply_to_message_id. Restoring a
  -- deleted message, editing content or metadata, re-targeting a reply and
  -- moving a message all stay frozen.
  if tg_op = 'UPDATE'
    and new.conversation_id = old.conversation_id
    and new.kind = old.kind
    and new.created_at is not distinct from old.created_at
    and new.edited_at is not distinct from old.edited_at
    and new.metadata is not distinct from old.metadata
    and (new.sender_id is not distinct from old.sender_id or new.sender_id is null)
    and (
      new.reply_to_message_id is not distinct from old.reply_to_message_id
      or new.reply_to_message_id is null
    )
    and (
      (
        new.content is not distinct from old.content
        and new.deleted_at is not distinct from old.deleted_at
      )
      or (
        old.deleted_at is null
        and new.deleted_at is not null
        and new.content = ''
      )
    ) then
    return new;
  end if;

  if private.chat_direct_conversation_blocked(new.conversation_id) then
    raise exception 'chat_blocked'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.chat_guard_blocked_direct_message() from public, anon, authenticated, service_role;
-- tuturuuu: no-grant (trigger)

create trigger chat_messages_block_guard
  before insert or update on private.chat_messages
  for each row
  execute function private.chat_guard_blocked_direct_message();

create function private.chat_guard_blocked_direct_reaction()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_conversation_id uuid;
begin
  select m.conversation_id into v_conversation_id
  from private.chat_messages m
  where m.id = new.message_id;

  if v_conversation_id is not null
    and private.chat_direct_conversation_blocked(v_conversation_id) then
    raise exception 'chat_blocked'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.chat_guard_blocked_direct_reaction() from public, anon, authenticated, service_role;
-- tuturuuu: no-grant (trigger)

-- Only INSERT is guarded: removing one's own reaction after a block adds
-- nothing to the conversation, so DELETE stays allowed.
create trigger chat_message_reactions_block_guard
  before insert on private.chat_message_reactions
  for each row
  execute function private.chat_guard_blocked_direct_reaction();

-- Re-check a new direct conversation after chat_create_conversation takes its
-- direct-key advisory lock. chat_block_user takes the same lock, so a block
-- that commits between the invite check and the member insert still refuses
-- the DM. AFTER INSERT skips ON CONFLICT DO UPDATE paths (mute, pin, rejoin of
-- an existing member row), which only touch an already frozen conversation.
create function private.chat_guard_blocked_direct_member()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if exists (
    select 1
    from private.chat_conversations c
    join private.chat_conversation_members other
      on other.conversation_id = c.id
     and other.user_id <> new.user_id
    where c.id = new.conversation_id
      and c.type = 'direct'
      and private.chat_users_blocked(new.user_id, other.user_id)
  ) then
    raise exception 'chat_target_not_invitable'
      using errcode = '42501';
  end if;

  return null;
end;
$$;

revoke all on function private.chat_guard_blocked_direct_member() from public, anon, authenticated, service_role;
-- tuturuuu: no-grant (trigger)

create trigger chat_conversation_members_block_guard
  after insert on private.chat_conversation_members
  for each row
  execute function private.chat_guard_blocked_direct_member();

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

create function private.chat_users_can_meet(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select p_actor_user_id is distinct from p_target_user_id
    and (
      private.chat_users_share_workspace(p_actor_user_id, p_target_user_id)
      or exists (
        select 1 from private.chat_friend_requests request
        where (request.requester_user_id = p_actor_user_id and request.recipient_user_id = p_target_user_id)
           or (request.requester_user_id = p_target_user_id and request.recipient_user_id = p_actor_user_id)
      )
      or exists (
        select 1
        from private.chat_conversation_members mine
        join private.chat_conversation_members theirs
          on theirs.conversation_id = mine.conversation_id
         and theirs.user_id = p_target_user_id
        where mine.user_id = p_actor_user_id
      )
    );
$$;

revoke all on function private.chat_users_can_meet(uuid, uuid) from public, anon, authenticated;
grant execute on function private.chat_users_can_meet(uuid, uuid) to service_role;

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

  -- Only people the actor can meet in chat (or already blocked) can be
  -- blocked, and an unknown id answers exactly like an unrelated one, so the
  -- route is not an account-existence oracle.
  if not (
    exists (
      select 1 from private.chat_user_blocks b
      where b.blocker_user_id = p_actor_user_id
        and b.blocked_user_id = p_target_user_id
    )
    or private.chat_users_can_meet(p_actor_user_id, p_target_user_id)
  ) then
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

  -- Same key as the direct-conversation lock in chat_create_conversation, so a
  -- block and a DM creation for this pair serialize.
  perform pg_advisory_xact_lock(hashtextextended(
    (
      select string_agg(pair.user_id::text, ':' order by pair.user_id::text)
      from unnest(array[p_actor_user_id, p_target_user_id]) as pair(user_id)
    ),
    0
  ));

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

-- The people who blocked [p_user_id]. The Web API uses it to skip pushes for
-- that person's group messages; it never reaches a client.
create function private.chat_list_blocker_user_ids(
  p_user_id uuid
)
returns uuid[]
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select coalesce(array_agg(b.blocker_user_id), '{}'::uuid[])
  from private.chat_user_blocks b
  where b.blocked_user_id = p_user_id;
$$;

revoke all on function private.chat_list_blocker_user_ids(uuid) from public, anon, authenticated;
grant execute on function private.chat_list_blocker_user_ids(uuid) to service_role;

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

-- Messages from people the viewer blocked are hidden on read, so they never
-- count as unread. The NOT EXISTS probes the (blocker, blocked) primary key.
create or replace function private.chat_conversation_json(
  p_conversation_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  conversation_json jsonb;
begin
  select jsonb_build_object(
    'id', c.id,
    'wsId', c.ws_id,
    'type', c.type,
    'title', c.title,
    'description', c.description,
    'aiEnabled', c.ai_enabled,
    'metadata', c.metadata,
    'createdBy', c.created_by,
    'createdAt', c.created_at::text,
    'updatedAt', c.updated_at::text,
    'archivedAt', c.archived_at::text,
    'memberCount', (
      select count(*)::int
      from private.chat_conversation_members cm_count
      where cm_count.conversation_id = c.id
        and cm_count.archived_at is null
    ),
    'unreadCount', (
      select count(*)::int
      from private.chat_messages m
      left join private.chat_conversation_members own_member
        on own_member.conversation_id = c.id
       and own_member.user_id = p_actor_user_id
      where m.conversation_id = c.id
        and m.deleted_at is null
        and coalesce(m.sender_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_actor_user_id
        and m.created_at > coalesce(own_member.last_read_at, '-infinity'::timestamptz)
        and not exists (
          select 1
          from private.chat_user_blocks viewer_block
          where viewer_block.blocker_user_id = p_actor_user_id
            and viewer_block.blocked_user_id = m.sender_id
        )
    ),
    'latestMessage', (
      select private.chat_message_json(m_latest)
      from private.chat_messages m_latest
      where m_latest.conversation_id = c.id
        and m_latest.deleted_at is null
      order by m_latest.created_at desc
      limit 1
    ),
    'members', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', cm.id,
            'conversationId', cm.conversation_id,
            'userId', cm.user_id,
            'role', cm.role,
            'joinedAt', cm.joined_at::text,
            'lastReadAt', cm.last_read_at::text,
            'mutedAt', cm.muted_at::text,
            'pinnedAt', cm.pinned_at::text,
            'archivedAt', cm.archived_at::text,
            'user', private.chat_member_profile_json(c.ws_id, cm.user_id)
          )
          order by cm.role = 'owner' desc, cm.joined_at
        ),
        '[]'::jsonb
      )
      from private.chat_conversation_members cm
      where cm.conversation_id = c.id
        and cm.archived_at is null
    )
  )
  into conversation_json
  from private.chat_conversations c
  where c.id = p_conversation_id
    and c.archived_at is null;

  return conversation_json;
end;
$$;

revoke all on function private.chat_conversation_json(uuid, uuid) from public, anon, authenticated;
grant execute on function private.chat_conversation_json(uuid, uuid) to service_role;

commit;
