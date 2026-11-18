-- Candidate for Forms owner review. Both production writers must switch together.
create function public.commit_form_response(p_submission jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_form private.forms%rowtype;
  v_session private.form_sessions%rowtype;
  v_share_id uuid := (p_submission->>'share_link_id')::uuid;
  v_session_id uuid := (p_submission->>'session_id')::uuid;
  v_actor_id uuid := (p_submission->>'respondent_user_id')::uuid;
  v_email text := p_submission->>'respondent_email';
  v_respondent_key text := p_submission->>'respondent_key';
  v_commitment text := p_submission->>'commitment';
  v_policy_revision text := p_submission->>'policy_revision';
  v_metadata jsonb := coalesce(p_submission->'metadata', '{}'::jsonb);
  v_answers jsonb := p_submission->'answers';
  v_response_id uuid;
  v_now timestamptz;
  v_limit integer;
  v_match_count bigint;
begin
  if v_session_id is null or v_commitment is null or v_commitment !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(v_answers) is distinct from 'array'
     or jsonb_array_length(v_answers) > 500 then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select * into v_form from private.forms
    where id = (p_submission->>'form_id')::uuid
      and ws_id = (p_submission->>'ws_id')::uuid
    for update;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;

  if v_share_id is not null then
    perform 1 from private.form_share_links
      where id = v_share_id and form_id = v_form.id and active
      for share;
    if not found or v_metadata <> '{}'::jsonb then
      return jsonb_build_object('kind', 'not_found');
    end if;
  elsif jsonb_typeof(v_metadata) is distinct from 'object'
      or nullif(v_metadata->>'meetRoomId', '') is null
      or nullif(v_metadata->>'meetLaunchId', '') is null
      or nullif(v_metadata->>'meetVersionId', '') is null then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select * into v_session from private.form_sessions where id = v_session_id for update;
  if found then
    if v_session.form_id <> v_form.id
       or v_session.share_link_id is distinct from v_share_id
       or (v_share_id is null and not v_session.metadata @> v_metadata) then
      return jsonb_build_object('kind', 'not_found');
    end if;
    if v_session.submitted_at is not null then
      if v_session.metadata->>'responseCommitment' is distinct from v_commitment then
        return jsonb_build_object('kind', 'conflict');
      end if;
      select id into strict v_response_id from private.form_responses
        where session_id = v_session.id and form_id = v_form.id;
      return jsonb_build_object('kind', 'submitted', 'response_id', v_response_id,
        'submitted_at', v_session.submitted_at, 'replayed', true);
    end if;
    -- New Meet submissions never create an uncommitted session outside this RPC.
    if v_share_id is null or exists (
      select 1 from private.form_responses where session_id = v_session_id
    ) then
      return jsonb_build_object('kind', 'conflict');
    end if;
  elsif v_share_id is not null then
    return jsonb_build_object('kind', 'not_found');
  end if;

  v_now := clock_timestamp();
  if v_form.status <> 'published'
     or (v_form.open_at is not null and v_form.open_at > v_now)
     or (v_form.close_at is not null and v_form.close_at < v_now)
     or (p_submission->>'snapshot_open_at')::timestamptz > v_now
     or (p_submission->>'snapshot_close_at')::timestamptz < v_now then
    return jsonb_build_object('kind', 'closed');
  end if;

  -- The caller attests server-verified Turnstile, or a server-verified exemption.
  -- Compare the authorized policy to the row after acquiring the per-form lock.
  if v_policy_revision is null or (v_policy_revision::timestamptz is distinct from v_form.updated_at)
     or (p_submission->>'access_mode') is distinct from v_form.access_mode
     or (p_submission->>'proof') not in ('verified', 'exempt')
     or p_submission->>'proof' is null
     or ((v_share_id is not null or v_form.settings->'requireTurnstile' is distinct from 'false'::jsonb)
          and p_submission->>'proof' is distinct from 'verified') then
    return jsonb_build_object('kind', 'policy_changed');
  end if;
  if (v_form.access_mode = 'anonymous' and (v_actor_id is not null or v_email is not null))
     or (v_form.access_mode <> 'anonymous' and v_actor_id is null)
     or (v_form.access_mode = 'authenticated_email' and nullif(v_email, '') is null)
     or (v_form.access_mode <> 'authenticated_email' and v_email is not null) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  v_limit := least(v_form.max_responses, (p_submission->>'snapshot_max_responses')::integer);
  if v_limit is not null then
    select count(*) into v_match_count from (
      select 1 from private.form_responses where form_id = v_form.id limit v_limit
    ) responses;
    if v_match_count >= v_limit then
      return jsonb_build_object('kind', 'limit');
    end if;
  end if;

  if v_form.settings->'oneResponsePerUser' = 'true'::jsonb
     or v_form.settings->'allowMultipleSubmissions' = 'false'::jsonb
     or p_submission->'snapshot_once' = 'true'::jsonb then
    if exists (
      select 1 from private.form_responses r
        left join private.form_sessions s on s.id = r.session_id
        where r.form_id = v_form.id and
          ((v_actor_id is not null and r.respondent_user_id = v_actor_id)
           or (v_respondent_key is not null and s.metadata->>'respondentKey' = v_respondent_key))
    ) then
      return jsonb_build_object('kind', 'limit');
    end if;
  end if;

  if v_share_id is null then
    insert into private.form_sessions (id, form_id, session_token, metadata, viewed_at)
      values (v_session_id, v_form.id, v_commitment, v_metadata, v_now);
    v_session.viewed_at := v_now;
  end if;

  insert into private.form_responses (
    id, form_id, share_link_id, session_id, respondent_user_id, respondent_email,
    duration_seconds, submitted_at
  ) values (
    case when v_share_id is null then v_session_id else gen_random_uuid() end,
    v_form.id, v_share_id, v_session_id, v_actor_id, v_email,
    greatest(0, round(extract(epoch from v_now - v_session.viewed_at)))::integer, v_now
  ) returning id into v_response_id;

  insert into private.form_response_answers (
    id, response_id, question_id, question_title, question_type, answer_text, answer_json
  )
  select case when v_share_id is not null then gen_random_uuid() else (
      substr(pinned.hex, 1, 8) || '-' || substr(pinned.hex, 9, 4) || '-8' ||
      substr(pinned.hex, 14, 3) || '-a' || substr(pinned.hex, 18, 3) || '-' ||
      substr(pinned.hex, 21, 12)
    )::uuid end,
    v_response_id, q.id, a.question_title, a.question_type, a.answer_text, a.answer_json
  from jsonb_to_recordset(v_answers) as a(
    question_id text, question_title text, question_type text, answer_text text, answer_json jsonb
  )
  left join private.form_questions q on q.id = a.question_id::uuid and q.form_id = v_form.id
  left join lateral (
    -- Keep the hash aligned with meetFormAnswerId, including the original pinned ID text.
    select encode(
      sha256(convert_to(
        '["meet-forms-answer",' || to_json(v_response_id)::text || ',' ||
          to_json(a.question_id)::text || ']',
        'UTF8'
      )),
      'hex'
    ) as hex
    where v_share_id is null
  ) pinned on true;

  update private.form_sessions
    set respondent_user_id = v_actor_id, respondent_email = v_email,
        started_at = viewed_at, submitted_at = v_now,
        last_section_id = (
          select id from private.form_sections
          where id = (p_submission->>'last_section_id')::uuid and form_id = v_form.id
        ),
        metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
          'responseCommitment', v_commitment, 'respondentKey', v_respondent_key
        ))
    where id = v_session_id;

  return jsonb_build_object('kind', 'submitted', 'response_id', v_response_id,
    'submitted_at', v_now, 'replayed', false);
end;
$$;

revoke all on function public.commit_form_response(jsonb) from public, anon, authenticated;
grant execute on function public.commit_form_response(jsonb) to service_role;
