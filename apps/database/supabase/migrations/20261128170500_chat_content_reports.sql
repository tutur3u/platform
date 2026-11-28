-- Chat and Mira content reports (Apple 1.2, Play UGC and AI-generated content
-- policies): user, message and Mira-response reports for staff review.
--
--   * private.chat_content_reports        one row per report, with a
--                                         server-captured content snapshot
--   * private.chat_submit_content_report  reporter-side write
--   * private.chat_list_content_reports   staff queue (verified staff only)
--   * private.chat_review_content_report  staff resolution
--
-- Every function is service_role only; the Web API binds the actor to the
-- verified session user. Decision and scope:
-- apps/docs/platform/chat-safety-and-ai-consent.mdx.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

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

    v_reported_user_id := null;
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
      and private.chat_can_address_conversation_workspace(
        p_ws_id, c.ws_id, c.type, p_actor_user_id
      )
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
    if not private.chat_users_can_meet(p_actor_user_id, v_reported_user_id) then
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
    return jsonb_build_object(
      'reportId', v_report_id,
      'duplicate', true,
      'reportedUserId', v_reported_user_id
    );
  end if;

  begin
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
  exception
    when unique_violation then
      -- A concurrent identical report won the race; answer with that one.
      select r.id
      into v_report_id
      from private.chat_content_reports r
      where r.reporter_user_id = p_actor_user_id
        and r.subject_type = p_subject_type
        and coalesce(r.message_id, r.ai_chat_message_id, r.reported_user_id)
          = coalesce(v_message_id, v_ai_chat_message_id, v_reported_user_id)
        and r.status in ('open', 'reviewing')
      limit 1;
      return jsonb_build_object(
        'reportId', v_report_id,
        'duplicate', true,
        'reportedUserId', v_reported_user_id
      );
  end;

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
  p_actor_user_id uuid,
  p_status text,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
begin
  -- The canonical verified-staff check (active infrastructure employee).
  perform private.assert_product_feedback_staff(p_actor_user_id);

  return (
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
  ) listed
  );
end;
$$;

revoke all on function private.chat_list_content_reports(uuid, text, integer) from public, anon, authenticated;
grant execute on function private.chat_list_content_reports(uuid, text, integer) to service_role;

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
  perform private.assert_product_feedback_staff(p_reviewer_user_id);

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
