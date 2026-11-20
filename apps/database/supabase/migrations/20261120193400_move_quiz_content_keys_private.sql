-- Matching pairs and ordering sequences are answer keys. They move from
-- public.workspace_quizzes.content to private.workspace_quiz_answers, and
-- content keeps only the learner prompt:
--   matching: {"pairs": [{"left": ...}], "choices": [...shuffled]}
--   ordering: {"items": [...shuffled], "shuffled": true}
-- The shuffle orders by md5(quiz id, value), never by authored position, so
-- the prompt cannot be replayed into the key.
--
-- A trigger moves any key a legacy writer still puts in content.
-- Direct table access is limited to course managers: view_user_groups or
-- update_user_groups to read, update_user_groups to write. Learners get
-- prompts only from the Learn server.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- tuturuuu: no-grant (internal)
create or replace function private.workspace_quiz_matching_pairs(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'left', pair.value ->> 'left',
        'right', pair.value ->> 'right'
      )
      order by pair.ordinality
    ),
    '[]'::jsonb
  )
  from pg_catalog.jsonb_array_elements(
    case
      when pg_catalog.jsonb_typeof(p_value) = 'array' then p_value
      when pg_catalog.jsonb_typeof(p_value) = 'object'
        and pg_catalog.jsonb_typeof(p_value -> 'pairs') = 'array'
        then p_value -> 'pairs'
      else '[]'::jsonb
    end
  ) with ordinality as pair(value, ordinality)
  where pg_catalog.jsonb_typeof(pair.value) = 'object'
    and pg_catalog.jsonb_typeof(pair.value -> 'left') in ('string', 'number', 'boolean')
    and pg_catalog.jsonb_typeof(pair.value -> 'right') in ('string', 'number', 'boolean')
    and pair.value ->> 'left' <> ''
    and pair.value ->> 'right' <> '';
$$;

-- tuturuuu: no-grant (internal)
create or replace function private.workspace_quiz_string_items(
  p_value jsonb,
  p_key text
)
returns jsonb
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    pg_catalog.jsonb_agg(item.value #>> '{}' order by item.ordinality),
    '[]'::jsonb
  )
  from pg_catalog.jsonb_array_elements(
    case
      when pg_catalog.jsonb_typeof(p_value) = 'object'
        and pg_catalog.jsonb_typeof(p_value -> p_key) = 'array'
        then p_value -> p_key
      else '[]'::jsonb
    end
  ) with ordinality as item(value, ordinality)
  where pg_catalog.jsonb_typeof(item.value) in ('string', 'number', 'boolean')
    and item.value #>> '{}' <> '';
$$;

-- The key a legacy writer left in content, or null when content is a prompt.
-- tuturuuu: no-grant (internal)
create or replace function private.workspace_quiz_authored_key(
  p_type text,
  p_content jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  v_items jsonb;
begin
  if p_type = 'matching' then
    v_items := private.workspace_quiz_matching_pairs(p_content);
    if pg_catalog.jsonb_array_length(v_items) > 0 then
      return pg_catalog.jsonb_build_object('pairs', v_items);
    end if;
  elsif p_type = 'ordering'
    and pg_catalog.jsonb_typeof(p_content) = 'object'
    and (p_content -> 'shuffled') is distinct from 'true'::jsonb
  then
    v_items := private.workspace_quiz_string_items(p_content, 'items');
    if pg_catalog.jsonb_array_length(v_items) > 0 then
      return pg_catalog.jsonb_build_object('order', v_items);
    end if;
  end if;
  return null;
end;
$$;

-- tuturuuu: no-grant (internal)
create or replace function private.workspace_quiz_has_key(
  p_type text,
  p_answer jsonb
)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case p_type
    when 'matching' then
      pg_catalog.jsonb_array_length(private.workspace_quiz_matching_pairs(p_answer)) > 0
    when 'ordering' then
      pg_catalog.jsonb_array_length(private.workspace_quiz_string_items(p_answer, 'order')) > 0
    else false
  end;
$$;

-- The stored learner prompt for a key.
-- tuturuuu: no-grant (internal)
create or replace function private.workspace_quiz_prompt_content(
  p_quiz_id uuid,
  p_type text,
  p_answer jsonb
)
returns jsonb
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case p_type
    when 'matching' then pg_catalog.jsonb_build_object(
      'pairs',
      (
        select coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object('left', pair.value ->> 'left')
            order by pair.ordinality
          ),
          '[]'::jsonb
        )
        from pg_catalog.jsonb_array_elements(
          private.workspace_quiz_matching_pairs(p_answer)
        ) with ordinality as pair(value, ordinality)
      ),
      'choices',
      (
        select coalesce(
          pg_catalog.jsonb_agg(
            pair.value ->> 'right'
            order by
              pg_catalog.md5(p_quiz_id::text || ':' || (pair.value ->> 'right')),
              pair.value ->> 'right'
          ),
          '[]'::jsonb
        )
        from pg_catalog.jsonb_array_elements(
          private.workspace_quiz_matching_pairs(p_answer)
        ) as pair(value)
      )
    )
    when 'ordering' then pg_catalog.jsonb_build_object(
      'items',
      (
        select coalesce(
          pg_catalog.jsonb_agg(
            item.value #>> '{}'
            order by
              pg_catalog.md5(p_quiz_id::text || ':' || (item.value #>> '{}')),
              item.value #>> '{}'
          ),
          '[]'::jsonb
        )
        from pg_catalog.jsonb_array_elements(
          private.workspace_quiz_string_items(p_answer, 'order')
        ) as item(value)
      ),
      'shuffled',
      true
    )
    else null
  end;
$$;

-- 1. Keys: keep a usable private key, otherwise take the authored content.
with authored as (
  select
    quiz.id,
    quiz.type,
    private.workspace_quiz_authored_key(quiz.type, quiz.content) as authored_key,
    existing.answer as existing_answer
  from public.workspace_quizzes as quiz
  left join private.workspace_quiz_answers as existing
    on existing.quiz_id = quiz.id
  where quiz.type in ('matching', 'ordering')
)
insert into private.workspace_quiz_answers (quiz_id, answer)
select authored.id, authored.authored_key
from authored
where authored.authored_key is not null
  and not private.workspace_quiz_has_key(authored.type, authored.existing_answer)
on conflict (quiz_id) do update
set
  answer = excluded.answer,
  updated_at = pg_catalog.now();

-- 2. Content: replace authored content with the prompt built from the key.
update public.workspace_quizzes as quiz
set content = private.workspace_quiz_prompt_content(quiz.id, quiz.type, key.answer)
from private.workspace_quiz_answers as key
where key.quiz_id = quiz.id
  and quiz.type in ('matching', 'ordering')
  and private.workspace_quiz_authored_key(quiz.type, quiz.content) is not null
  and private.workspace_quiz_has_key(quiz.type, key.answer);

-- 3. Backstop for writers that still send authored content.
-- tuturuuu: no-grant (trigger)
create or replace function private.move_workspace_quiz_content_key()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_key jsonb;
begin
  v_key := private.workspace_quiz_authored_key(new.type, new.content);
  if v_key is null then
    return null;
  end if;

  insert into private.workspace_quiz_answers (quiz_id, answer)
  values (new.id, v_key)
  on conflict (quiz_id) do update
  set
    answer = excluded.answer,
    updated_at = pg_catalog.now();

  update public.workspace_quizzes
  set content = private.workspace_quiz_prompt_content(new.id, new.type, v_key)
  where id = new.id;

  return null;
end;
$$;

drop trigger if exists move_workspace_quiz_content_key
  on public.workspace_quizzes;

create trigger move_workspace_quiz_content_key
after insert or update of content, type
on public.workspace_quizzes
for each row
when (new.type in ('matching', 'ordering'))
execute function private.move_workspace_quiz_content_key();

revoke all on function private.workspace_quiz_matching_pairs(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.workspace_quiz_string_items(jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function private.workspace_quiz_authored_key(text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.workspace_quiz_has_key(text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.workspace_quiz_prompt_content(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.move_workspace_quiz_content_key()
  from public, anon, authenticated, service_role;

-- 4. Direct access: course managers only. The Learn and Teach servers use
-- service_role after their own permission checks.
drop policy if exists "Allow all access for workspace member"
  on public.workspace_quizzes;
drop policy if exists workspace_quizzes_select_course_managers
  on public.workspace_quizzes;
drop policy if exists workspace_quizzes_insert_course_managers
  on public.workspace_quizzes;
drop policy if exists workspace_quizzes_update_course_managers
  on public.workspace_quizzes;
drop policy if exists workspace_quizzes_delete_course_managers
  on public.workspace_quizzes;

create policy workspace_quizzes_select_course_managers
  on public.workspace_quizzes
  for select
  to authenticated
  using (
    public.has_workspace_permission(ws_id, (select auth.uid()), 'view_user_groups')
    or public.has_workspace_permission(ws_id, (select auth.uid()), 'update_user_groups')
  );

create policy workspace_quizzes_insert_course_managers
  on public.workspace_quizzes
  for insert
  to authenticated
  with check (
    public.has_workspace_permission(ws_id, (select auth.uid()), 'update_user_groups')
  );

create policy workspace_quizzes_update_course_managers
  on public.workspace_quizzes
  for update
  to authenticated
  using (
    public.has_workspace_permission(ws_id, (select auth.uid()), 'update_user_groups')
  )
  with check (
    public.has_workspace_permission(ws_id, (select auth.uid()), 'update_user_groups')
  );

create policy workspace_quizzes_delete_course_managers
  on public.workspace_quizzes
  for delete
  to authenticated
  using (
    public.has_workspace_permission(ws_id, (select auth.uid()), 'update_user_groups')
  );

revoke all on table public.workspace_quizzes from anon;
revoke truncate on table public.workspace_quizzes from authenticated;
