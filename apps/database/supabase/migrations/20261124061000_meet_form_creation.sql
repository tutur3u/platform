-- Meet inline form creation in three idempotent phases keyed by (meeting, request):
-- reserve server-generated form and launch ids, materialize the prepared
-- definition as a draft form, then publish it after the room stores the launch.
-- The Meet API calls this with the service key after its host check. Every phase
-- repeats the workspace membership and manage_forms check for the acting user
-- before any replay, so a revoked host cannot resume an earlier intent.

begin;

-- The foreign keys lock public.workspace_meetings, public.workspaces and
-- public.users; give up rather than queue live traffic behind the migration.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.meet_form_creation_intents (
  meeting_id uuid not null references public.workspace_meetings(id) on delete cascade,
  request_id uuid not null,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid not null references public.users(id) on delete cascade,
  commitment text not null check (commitment ~ '^[0-9a-f]{64}$'),
  form_id uuid not null unique,
  launch_id uuid not null unique,
  created_at timestamptz not null,
  launch jsonb check (
    launch is null
    or (jsonb_typeof(launch) = 'object' and octet_length(launch::text) <= 98304)
  ),
  published_at timestamptz check (published_at is null or launch is not null),
  primary key (meeting_id, request_id)
);

create index meet_form_creation_intents_ws_id_idx
  on private.meet_form_creation_intents (ws_id);
create index meet_form_creation_intents_actor_id_idx
  on private.meet_form_creation_intents (actor_id);

alter table private.meet_form_creation_intents enable row level security;

revoke all on private.meet_form_creation_intents
  from public, anon, authenticated, service_role;
grant select, insert, update on private.meet_form_creation_intents to service_role;

create function private.meet_form_creation(
  p_scope jsonb,
  p_operation text,
  p_value jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ws_id uuid;
  v_meeting_id uuid;
  v_actor_id uuid;
  v_request_id uuid;
  v_commitment text;
  v_intent private.meet_form_creation_intents%rowtype;
  v_form jsonb;
  v_status text;
  v_count bigint;
begin
  if jsonb_typeof(p_scope) is distinct from 'object'
     or p_operation is null
     or p_operation not in ('reserve', 'materialize', 'finalize') then
    return jsonb_build_object('kind', 'invalid');
  end if;
  v_commitment := p_scope->>'commitment';
  if v_commitment is null or v_commitment !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('kind', 'invalid');
  end if;
  begin
    v_ws_id := (p_scope->>'workspace_id')::uuid;
    v_meeting_id := (p_scope->>'meeting_id')::uuid;
    v_actor_id := (p_scope->>'actor_id')::uuid;
    v_request_id := (p_scope->>'request_id')::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('kind', 'invalid');
  end;
  if v_ws_id is null or v_meeting_id is null or v_actor_id is null
     or v_request_id is null then
    return jsonb_build_object('kind', 'invalid');
  end if;

  -- Authorize every phase before any replay.
  perform 1 from public.workspace_meetings as m
    where m.id = v_meeting_id and m.ws_id = v_ws_id
    for key share;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;
  if public.is_org_member(v_actor_id, v_ws_id) is distinct from true
     or public.has_workspace_permission(v_ws_id, v_actor_id, 'manage_forms')
       is distinct from true then
    return jsonb_build_object('kind', 'forbidden');
  end if;

  if p_operation = 'reserve' then
    -- Serializes the per-room cap with concurrent first reservations.
    perform pg_advisory_xact_lock(
      hashtextextended('meet_form_creation:' || v_meeting_id::text, 0)
    );
  end if;
  select i.* into v_intent from private.meet_form_creation_intents as i
    where i.meeting_id = v_meeting_id and i.request_id = v_request_id
    for update;

  if not found then
    if p_operation <> 'reserve' then
      return jsonb_build_object('kind', 'not_found');
    end if;
    select count(*) into v_count from (
      select 1 from private.meet_form_creation_intents as i
        where i.meeting_id = v_meeting_id
        limit 50
    ) as intents;
    if v_count >= 50 then
      return jsonb_build_object('kind', 'limit');
    end if;
    insert into private.meet_form_creation_intents
      (meeting_id, request_id, ws_id, actor_id, commitment, form_id, launch_id, created_at)
      values (v_meeting_id, v_request_id, v_ws_id, v_actor_id, v_commitment,
        gen_random_uuid(), gen_random_uuid(), clock_timestamp())
      returning * into v_intent;
    return jsonb_build_object('kind', 'reserved', 'formId', v_intent.form_id,
      'launchId', v_intent.launch_id, 'createdAt', v_intent.created_at);
  end if;

  if v_intent.ws_id <> v_ws_id or v_intent.actor_id <> v_actor_id
     or v_intent.commitment <> v_commitment then
    return jsonb_build_object('kind', 'conflict');
  end if;

  if v_intent.launch is null then
    if p_operation = 'reserve' then
      return jsonb_build_object('kind', 'reserved', 'formId', v_intent.form_id,
        'launchId', v_intent.launch_id, 'createdAt', v_intent.created_at);
    end if;
    if p_operation = 'finalize' then
      return jsonb_build_object('kind', 'not_found');
    end if;

    if jsonb_typeof(p_value) is distinct from 'object'
       or octet_length(p_value::text) > 98304 then
      return jsonb_build_object('kind', 'invalid');
    end if;
    v_form := p_value->'form';
    -- The stored launch must agree with the form row, which always requires
    -- Turnstile for Meet-created forms.
    if jsonb_typeof(v_form) is distinct from 'object'
       or v_form->>'status' is distinct from 'published'
       or v_form->'settings'->'requireTurnstile' is distinct from 'true'::jsonb
       or jsonb_typeof(v_form->'sections') is distinct from 'array'
       or jsonb_typeof(v_form->'logicRules') is distinct from 'array'
       or jsonb_typeof(v_form->'settings') is distinct from 'object'
       or jsonb_typeof(v_form->'theme') is distinct from 'object'
       or jsonb_typeof(v_form->'seo') is distinct from 'object'
       or jsonb_array_length(v_form->'sections') not between 1 and 40
       or jsonb_array_length(v_form->'logicRules') > 120 then
      return jsonb_build_object('kind', 'invalid');
    end if;

    begin
      if (p_value->>'launchId')::uuid is distinct from v_intent.launch_id
         or (p_value->>'formId')::uuid is distinct from v_intent.form_id
         or (p_value->>'versionId')::uuid is null
         or (v_form->>'id')::uuid is distinct from v_intent.form_id
         or (v_form->>'wsId')::uuid is distinct from v_ws_id
         or (v_form->>'creatorId')::uuid is distinct from v_actor_id
         or (v_form->>'createdAt')::timestamptz is distinct from v_intent.created_at then
        return jsonb_build_object('kind', 'invalid');
      end if;

      if exists (
        select 1 from jsonb_array_elements(v_form->'sections') as s(section)
          where jsonb_typeof(s.section->'questions') is distinct from 'array'
             or exists (
               select 1 from jsonb_array_elements(s.section->'questions') as q(question)
                 where jsonb_typeof(q.question->'options') is distinct from 'array'
                    or q.question->>'sectionId' is distinct from s.section->>'id'
             )
      ) then
        return jsonb_build_object('kind', 'invalid');
      end if;
      select count(*) into v_count
        from jsonb_array_elements(v_form->'sections') as s(section),
          jsonb_array_elements(s.section->'questions') as q(question);
      if v_count not between 1 and 120 then
        return jsonb_build_object('kind', 'invalid');
      end if;
      select count(*) into v_count
        from jsonb_array_elements(v_form->'sections') as s(section),
          jsonb_array_elements(s.section->'questions') as q(question),
          jsonb_array_elements(q.question->'options') as o(option);
      if v_count > 500 then
        return jsonb_build_object('kind', 'invalid');
      end if;

      insert into private.forms (
        id, ws_id, creator_id, title, description, status, access_mode,
        open_at, close_at, max_responses, settings, theme, seo,
        created_at, updated_at
      ) values (
        v_intent.form_id, v_ws_id, v_actor_id, v_form->>'title',
        v_form->>'description', 'draft', v_form->>'accessMode',
        (v_form->>'openAt')::timestamptz, (v_form->>'closeAt')::timestamptz,
        (v_form->>'maxResponses')::integer,
        (v_form->'settings') || '{"requireTurnstile": true}'::jsonb,
        v_form->'theme', v_form->'seo', v_intent.created_at, v_intent.created_at
      );

      insert into private.form_sections (id, form_id, title, description, position)
        select (s.section->>'id')::uuid, v_intent.form_id, s.section->>'title',
          s.section->>'description', (s.ordinality - 1)::integer
        from jsonb_array_elements(v_form->'sections') with ordinality as s(section, ordinality);

      insert into private.form_questions (
        id, form_id, section_id, type, title, description, required, position,
        image, settings
      )
        select (q.question->>'id')::uuid, v_intent.form_id, (s.section->>'id')::uuid,
          q.question->>'type', q.question->>'title', q.question->>'description',
          (q.question->>'required')::boolean, (q.ordinality - 1)::integer,
          q.question->'image', coalesce(q.question->'settings', '{}'::jsonb)
        from jsonb_array_elements(v_form->'sections') as s(section),
          jsonb_array_elements(s.section->'questions') with ordinality as q(question, ordinality);

      insert into private.form_question_options (id, question_id, label, value, image, position)
        select (o.option->>'id')::uuid, (q.question->>'id')::uuid, o.option->>'label',
          o.option->>'value', o.option->'image', (o.ordinality - 1)::integer
        from jsonb_array_elements(v_form->'sections') as s(section),
          jsonb_array_elements(s.section->'questions') as q(question),
          jsonb_array_elements(q.question->'options') with ordinality as o(option, ordinality);

      -- Branches may only reference this form's own sections and questions.
      if exists (
        select 1 from jsonb_array_elements(v_form->'logicRules') as r(rule)
          where (nullif(r.rule->>'sourceQuestionId', '') is not null and not exists (
                  select 1 from private.form_questions as fq
                    where fq.form_id = v_intent.form_id
                      and fq.id = (r.rule->>'sourceQuestionId')::uuid))
             or (nullif(r.rule->>'sourceSectionId', '') is not null and not exists (
                  select 1 from private.form_sections as fs
                    where fs.form_id = v_intent.form_id
                      and fs.id = (r.rule->>'sourceSectionId')::uuid))
             or (nullif(r.rule->>'targetSectionId', '') is not null and not exists (
                  select 1 from private.form_sections as fs
                    where fs.form_id = v_intent.form_id
                      and fs.id = (r.rule->>'targetSectionId')::uuid))
      ) then
        raise exception 'Meet form branch references another form'
          using errcode = '23503';
      end if;

      insert into private.form_logic_rules (
        id, form_id, trigger_type, source_question_id, source_section_id,
        operator, comparison_value, action_type, target_section_id, priority
      )
        select (r.rule->>'id')::uuid, v_intent.form_id,
          coalesce(r.rule->>'triggerType', 'question'),
          nullif(r.rule->>'sourceQuestionId', '')::uuid,
          nullif(r.rule->>'sourceSectionId', '')::uuid,
          r.rule->>'operator', coalesce(r.rule->>'comparisonValue', ''),
          r.rule->>'actionType', nullif(r.rule->>'targetSectionId', '')::uuid,
          (r.ordinality - 1)::integer
        from jsonb_array_elements(v_form->'logicRules') with ordinality as r(rule, ordinality);

      update private.meet_form_creation_intents as i
        set launch = p_value
        where i.meeting_id = v_meeting_id and i.request_id = v_request_id
        returning * into v_intent;
    exception when data_exception or integrity_constraint_violation then
      -- The block rolls back every row it wrote; the reservation stays usable.
      return jsonb_build_object('kind', 'invalid');
    end;
    return jsonb_build_object('kind', 'staged', 'launch', v_intent.launch);
  end if;

  select f.status into v_status from private.forms as f
    where f.id = v_intent.form_id and f.ws_id = v_ws_id
    for update;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;

  if p_operation = 'finalize' and v_intent.published_at is null then
    if v_status = 'draft' then
      update private.forms as f
        set status = 'published', published_at = coalesce(f.published_at, clock_timestamp())
        where f.id = v_intent.form_id and f.ws_id = v_ws_id;
    elsif v_status <> 'published' then
      return jsonb_build_object('kind', 'closed');
    end if;
    update private.meet_form_creation_intents as i
      set published_at = clock_timestamp()
      where i.meeting_id = v_meeting_id and i.request_id = v_request_id
      returning * into v_intent;
  end if;

  return jsonb_build_object(
    'kind', case when v_intent.published_at is null then 'staged' else 'published' end,
    'launch', v_intent.launch
  );
end;
$$;

revoke all on function private.meet_form_creation(jsonb, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.meet_form_creation(jsonb, text, jsonb) to service_role;

commit;
