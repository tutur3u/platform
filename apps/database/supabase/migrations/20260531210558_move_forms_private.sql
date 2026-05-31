-- Move the forms feature off the public Data API surface.
--
-- Forms remain reachable through apps/web pages and API routes after workspace
-- permissions and share-link access are checked there. The underlying form
-- definitions, sessions, responses, answers, and analytics RPCs now live in
-- the private schema with service-role-only direct access.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.forms
  set schema private;

alter table if exists public.form_sections
  set schema private;

alter table if exists public.form_questions
  set schema private;

alter table if exists public.form_question_options
  set schema private;

alter table if exists public.form_logic_rules
  set schema private;

alter table if exists public.form_share_links
  set schema private;

alter table if exists public.form_sessions
  set schema private;

alter table if exists public.form_responses
  set schema private;

alter table if exists public.form_response_answers
  set schema private;

drop trigger if exists forms_touch_updated_at
  on private.forms;

drop policy if exists "Forms read access for managers and analysts"
  on private.forms;
drop policy if exists "Forms insert access for managers"
  on private.forms;
drop policy if exists "Forms update access for managers"
  on private.forms;
drop policy if exists "Forms delete access for managers"
  on private.forms;

drop policy if exists "Form sections read access"
  on private.form_sections;
drop policy if exists "Form sections write access"
  on private.form_sections;

drop policy if exists "Form questions read access"
  on private.form_questions;
drop policy if exists "Form questions write access"
  on private.form_questions;

drop policy if exists "Form question options read access"
  on private.form_question_options;
drop policy if exists "Form question options write access"
  on private.form_question_options;

drop policy if exists "Form logic read access"
  on private.form_logic_rules;
drop policy if exists "Form logic write access"
  on private.form_logic_rules;

drop policy if exists "Form share links read access"
  on private.form_share_links;
drop policy if exists "Form share links write access"
  on private.form_share_links;

drop policy if exists "Form sessions analytics access"
  on private.form_sessions;
drop policy if exists "Form sessions manager access"
  on private.form_sessions;

drop policy if exists "Form responses analytics access"
  on private.form_responses;
drop policy if exists "Form responses manager access"
  on private.form_responses;

drop policy if exists "Form response answers analytics access"
  on private.form_response_answers;
drop policy if exists "Form response answers manager access"
  on private.form_response_answers;

drop policy if exists "Service role can manage private forms"
  on private.forms;
drop policy if exists "Service role can manage private form sections"
  on private.form_sections;
drop policy if exists "Service role can manage private form questions"
  on private.form_questions;
drop policy if exists "Service role can manage private form question options"
  on private.form_question_options;
drop policy if exists "Service role can manage private form logic rules"
  on private.form_logic_rules;
drop policy if exists "Service role can manage private form share links"
  on private.form_share_links;
drop policy if exists "Service role can manage private form sessions"
  on private.form_sessions;
drop policy if exists "Service role can manage private form responses"
  on private.form_responses;
drop policy if exists "Service role can manage private form response answers"
  on private.form_response_answers;

drop function if exists public.get_form_workspace_id(uuid);
drop function if exists public.can_manage_form(uuid);
drop function if exists public.can_view_form_analytics(uuid);
drop function if exists public.form_id_from_section(uuid);
drop function if exists public.form_id_from_question(uuid);
drop function if exists public.form_id_from_share_link(uuid);
drop function if exists public.form_id_from_response(uuid);
drop function if exists public.touch_form_updated_at();
drop function if exists public.get_form_matched_response_ids(uuid, text);
drop function if exists public.get_form_response_page(uuid, text, integer, integer);
drop function if exists public.get_form_response_rollups(uuid, text);
drop function if exists public.get_form_analytics_overview(uuid);

create or replace function private.get_form_workspace_id(p_form_id uuid)
returns uuid
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select ws_id
  from private.forms
  where id = p_form_id;
$$;

create or replace function private.can_manage_form(p_form_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select exists (
    select 1
    from private.forms f
    where f.id = p_form_id
      and (
        f.creator_id = auth.uid()
        or public.has_workspace_permission(auth.uid(), f.ws_id, 'manage_forms')
      )
  );
$$;

create or replace function private.can_view_form_analytics(p_form_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select exists (
    select 1
    from private.forms f
    where f.id = p_form_id
      and (
        f.creator_id = auth.uid()
        or public.has_workspace_permission(auth.uid(), f.ws_id, 'manage_forms')
        or public.has_workspace_permission(auth.uid(), f.ws_id, 'view_form_analytics')
      )
  );
$$;

create or replace function private.form_id_from_section(p_section_id uuid)
returns uuid
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select form_id
  from private.form_sections
  where id = p_section_id;
$$;

create or replace function private.form_id_from_question(p_question_id uuid)
returns uuid
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select form_id
  from private.form_questions
  where id = p_question_id;
$$;

create or replace function private.form_id_from_share_link(p_share_link_id uuid)
returns uuid
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select form_id
  from private.form_share_links
  where id = p_share_link_id;
$$;

create or replace function private.form_id_from_response(p_response_id uuid)
returns uuid
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select form_id
  from private.form_responses
  where id = p_response_id;
$$;

create or replace function private.touch_form_updated_at()
returns trigger
language plpgsql
set search_path = private, public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger forms_touch_updated_at
before update on private.forms
for each row
execute function private.touch_form_updated_at();

revoke all on table
  private.forms,
  private.form_sections,
  private.form_questions,
  private.form_question_options,
  private.form_logic_rules,
  private.form_share_links,
  private.form_sessions,
  private.form_responses,
  private.form_response_answers
from public, anon, authenticated;

grant all on table
  private.forms,
  private.form_sections,
  private.form_questions,
  private.form_question_options,
  private.form_logic_rules,
  private.form_share_links,
  private.form_sessions,
  private.form_responses,
  private.form_response_answers
to service_role;

alter table private.forms enable row level security;
alter table private.form_sections enable row level security;
alter table private.form_questions enable row level security;
alter table private.form_question_options enable row level security;
alter table private.form_logic_rules enable row level security;
alter table private.form_share_links enable row level security;
alter table private.form_sessions enable row level security;
alter table private.form_responses enable row level security;
alter table private.form_response_answers enable row level security;

create policy "Service role can manage private forms"
  on private.forms
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage private form sections"
  on private.form_sections
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage private form questions"
  on private.form_questions
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage private form question options"
  on private.form_question_options
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage private form logic rules"
  on private.form_logic_rules
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage private form share links"
  on private.form_share_links
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage private form sessions"
  on private.form_sessions
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage private form responses"
  on private.form_responses
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage private form response answers"
  on private.form_response_answers
  for all
  to service_role
  using (true)
  with check (true);

create or replace function private.get_form_matched_response_ids(
  p_form_id uuid,
  p_query text default null
)
returns table ("response_id" uuid)
language sql
stable
set search_path = private, public, pg_temp
as $$
  with normalized_query as (
    select nullif(btrim(p_query), '') as query
  )
  select r.id as response_id
  from private.form_responses r
  cross join normalized_query nq
  where r.form_id = p_form_id
    and (
      nq.query is null
      or coalesce(r.respondent_email, '') ilike '%' || nq.query || '%'
      or exists (
        select 1
        from private.form_response_answers a
        where a.response_id = r.id
          and (
            coalesce(a.question_title, '') ilike '%' || nq.query || '%'
            or coalesce(a.answer_text, '') ilike '%' || nq.query || '%'
            or coalesce(a.answer_json::text, '') ilike '%' || nq.query || '%'
          )
      )
    );
$$;

create or replace function private.get_form_response_page(
  p_form_id uuid,
  p_query text default null,
  p_page_size integer default 10,
  p_page integer default 1
)
returns table (
  "id" uuid,
  "session_id" uuid,
  "created_at" timestamptz,
  "submitted_at" timestamptz,
  "respondent_email" text,
  "respondent_user_id" uuid,
  "total_count" bigint
)
language sql
stable
set search_path = private, public, pg_temp
as $$
  with paging as (
    select
      greatest(coalesce(p_page_size, 10), 1) as page_size,
      greatest(coalesce(p_page, 1), 1) as page_number
  ),
  matched as (
    select
      r.id,
      r.session_id,
      r.created_at,
      r.submitted_at,
      r.respondent_email,
      r.respondent_user_id
    from private.form_responses r
    join private.get_form_matched_response_ids(p_form_id, p_query) matched_ids
      on matched_ids.response_id = r.id
  ),
  numbered as (
    select
      m.id,
      m.session_id,
      m.created_at,
      m.submitted_at,
      m.respondent_email,
      m.respondent_user_id,
      count(*) over () as total_count,
      row_number() over (order by m.submitted_at desc) as row_number
    from matched m
  )
  select
    numbered.id,
    numbered.session_id,
    numbered.created_at,
    numbered.submitted_at,
    numbered.respondent_email,
    numbered.respondent_user_id,
    numbered.total_count
  from numbered
  cross join paging
  where numbered.row_number > (paging.page_number - 1) * paging.page_size
    and numbered.row_number <= paging.page_number * paging.page_size
  order by numbered.row_number;
$$;

create or replace function private.get_form_response_rollups(
  p_form_id uuid,
  p_query text default null
)
returns jsonb
language sql
stable
set search_path = private, public, pg_temp
as $$
  with matched_responses as (
    select r.*
    from private.form_responses r
    join private.get_form_matched_response_ids(p_form_id, p_query) matched_ids
      on matched_ids.response_id = r.id
  ),
  question_catalog as (
    select
      q.id,
      q.type,
      coalesce(nullif(q.title, ''), 'Untitled question') as title,
      q.position as question_position,
      s.position as section_position
    from private.form_questions q
    join private.form_sections s on s.id = q.section_id
    where q.form_id = p_form_id
      and q.type <> 'section_break'
  ),
  answer_rows as (
    select
      a.response_id,
      a.question_id,
      qc.type,
      a.answer_text,
      a.answer_json
    from private.form_response_answers a
    join matched_responses r on r.id = a.response_id
    join question_catalog qc on qc.id = a.question_id
  ),
  scalar_answers as (
    select
      ar.question_id,
      ar.type,
      case
        when ar.answer_text is not null and btrim(ar.answer_text) <> '' then ar.answer_text
        when ar.answer_json is null then null
        when jsonb_typeof(ar.answer_json) = 'string'
          then trim(both '"' from ar.answer_json::text)
        when jsonb_typeof(ar.answer_json) in ('number', 'boolean')
          then ar.answer_json::text
        else null
      end as answer_value
    from answer_rows ar
  ),
  array_answers as (
    select
      ar.question_id,
      ar.type,
      choice.value as answer_value
    from answer_rows ar
    cross join lateral jsonb_array_elements_text(ar.answer_json) as choice(value)
    where ar.type = 'multiple_choice'
      and ar.answer_json is not null
      and jsonb_typeof(ar.answer_json) = 'array'
  ),
  answer_value_counts as (
    select
      values_by_question.question_id,
      values_by_question.answer_value,
      count(*)::int as count
    from (
      select
        sa.question_id,
        sa.answer_value
      from scalar_answers sa
      where sa.type in ('single_choice', 'dropdown', 'rating', 'linear_scale')
        and sa.answer_value is not null
        and btrim(sa.answer_value) <> ''

      union all

      select
        aa.question_id,
        aa.answer_value
      from array_answers aa
      where aa.answer_value is not null
        and btrim(aa.answer_value) <> ''
    ) as values_by_question
    group by values_by_question.question_id, values_by_question.answer_value
  ),
  question_totals as (
    select
      ar.question_id,
      count(*)::int as total_answers
    from answer_rows ar
    group by ar.question_id
  ),
  mean_scores as (
    select
      sa.question_id,
      round(avg(sa.answer_value::numeric), 1) as mean_score
    from scalar_answers sa
    where sa.type in ('rating', 'linear_scale')
      and sa.answer_value ~ '^-?\d+(\.\d+)?$'
    group by sa.question_id
  ),
  response_summary as (
    select
      count(*)::int as total_submissions,
      count(distinct
        case
          when r.respondent_user_id is not null
            then 'user:' || r.respondent_user_id::text
          when r.respondent_email is not null and btrim(r.respondent_email) <> ''
            then 'email:' || lower(r.respondent_email)
          else 'anon:' || r.id::text
        end
      )::int as total_responders,
      count(distinct r.respondent_user_id) filter (
        where r.respondent_user_id is not null
      )::int as authenticated_responders,
      count(*) filter (
        where r.respondent_user_id is null
          and (r.respondent_email is null or btrim(r.respondent_email) = '')
      )::int as anonymous_submissions
    from matched_responses r
  ),
  duplicate_authenticated as (
    select
      count(*)::int as duplicate_authenticated_responders,
      coalesce(sum(user_counts.response_count), 0)::int as duplicate_authenticated_submissions
    from (
      select
        r.respondent_user_id,
        count(*)::int as response_count
      from matched_responses r
      where r.respondent_user_id is not null
      group by r.respondent_user_id
      having count(*) > 1
    ) as user_counts
  ),
  question_analytics as (
    select coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'questionId', qc.id,
            'title', qc.title,
            'type', qc.type,
            'totalAnswers', coalesce(qt.total_answers, 0),
            'choices',
              case
                when qc.type in ('single_choice', 'multiple_choice', 'dropdown')
                  then coalesce((
                    select jsonb_agg(
                      jsonb_build_object(
                        'label', qo.label,
                        'value', qo.value,
                        'count', coalesce(avc.count, 0),
                        'percentage',
                          case
                            when rs.total_submissions = 0 then 0
                            else round(coalesce(avc.count, 0) * 100.0 / rs.total_submissions)::int
                          end
                      )
                      order by qo.position
                    )
                    from private.form_question_options qo
                    left join answer_value_counts avc
                      on avc.question_id = qc.id
                     and avc.answer_value = qo.value
                    cross join response_summary rs
                    where qo.question_id = qc.id
                  ), '[]'::jsonb)
                else null
              end,
            'scale',
              case
                when qc.type in ('rating', 'linear_scale')
                  then coalesce((
                    select jsonb_agg(
                      jsonb_build_object(
                        'score', qo.value,
                        'label', qo.label,
                        'count', coalesce(avc.count, 0),
                        'percentage',
                          case
                            when rs.total_submissions = 0 then 0
                            else round(coalesce(avc.count, 0) * 100.0 / rs.total_submissions)::int
                          end
                      )
                      order by qo.position
                    )
                    from private.form_question_options qo
                    left join answer_value_counts avc
                      on avc.question_id = qc.id
                     and avc.answer_value = qo.value
                    cross join response_summary rs
                    where qo.question_id = qc.id
                  ), '[]'::jsonb)
                else null
              end,
            'meanScore',
              case
                when qc.type in ('rating', 'linear_scale')
                  then ms.mean_score
                else null
              end
          )
        )
        order by qc.section_position, qc.question_position
      ),
      '[]'::jsonb
    ) as data
    from question_catalog qc
    left join question_totals qt on qt.question_id = qc.id
    left join mean_scores ms on ms.question_id = qc.id
  )
  select jsonb_build_object(
    'total', coalesce((select total_submissions from response_summary), 0),
    'summary', jsonb_build_object(
      'totalSubmissions', coalesce((select total_submissions from response_summary), 0),
      'totalResponders', coalesce((select total_responders from response_summary), 0),
      'authenticatedResponders', coalesce((select authenticated_responders from response_summary), 0),
      'anonymousSubmissions', coalesce((select anonymous_submissions from response_summary), 0),
      'duplicateAuthenticatedResponders', coalesce((select duplicate_authenticated_responders from duplicate_authenticated), 0),
      'duplicateAuthenticatedSubmissions', coalesce((select duplicate_authenticated_submissions from duplicate_authenticated), 0),
      'hasMultipleSubmissionsByUser',
        coalesce((select duplicate_authenticated_responders from duplicate_authenticated), 0) > 0
    ),
    'questionAnalytics', coalesce((select data from question_analytics), '[]'::jsonb)
  );
$$;

create or replace function private.get_form_analytics_overview(p_form_id uuid)
returns jsonb
language sql
stable
set search_path = private, public, pg_temp
as $$
  with sessions as (
    select *
    from private.form_sessions
    where form_id = p_form_id
  ),
  responses as (
    select *
    from private.form_responses
    where form_id = p_form_id
  ),
  section_catalog as (
    select
      s.id,
      coalesce(nullif(s.title, ''), 'Untitled section') as title,
      s.position
    from private.form_sections s
    where s.form_id = p_form_id
  ),
  question_catalog as (
    select
      q.id,
      coalesce(nullif(q.title, ''), 'Untitled question') as title,
      q.position as question_position,
      s.position as section_position
    from private.form_questions q
    join private.form_sections s on s.id = q.section_id
    where q.form_id = p_form_id
      and q.type <> 'section_break'
  ),
  totals as (
    select
      (select count(*)::int from sessions) as total_views,
      (select count(*)::int from sessions where started_at is not null) as total_starts,
      (select count(*)::int from responses) as total_submissions,
      coalesce(
        (select round(avg(duration_seconds))::int from responses where duration_seconds > 0),
        0
      ) as avg_completion_seconds,
      (select count(distinct referrer_domain)::int
       from sessions
       where referrer_domain is not null and btrim(referrer_domain) <> '') as unique_referrers,
      (select count(distinct country)::int
       from sessions
       where country is not null and btrim(country) <> '') as unique_countries
  ),
  activity as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', activity_rows.date,
          'views', activity_rows.views,
          'starts', activity_rows.starts,
          'submissions', activity_rows.submissions
        )
        order by activity_rows.date
      ),
      '[]'::jsonb
    ) as data
    from (
      select *
      from (
        select
          activity_source.date,
          sum(activity_source.views)::int as views,
          sum(activity_source.starts)::int as starts,
          sum(activity_source.submissions)::int as submissions
        from (
          select viewed_at::date as date, 1 as views, 0 as starts, 0 as submissions
          from sessions

          union all

          select started_at::date as date, 0 as views, 1 as starts, 0 as submissions
          from sessions
          where started_at is not null

          union all

          select submitted_at::date as date, 0 as views, 0 as starts, 1 as submissions
          from responses
        ) as activity_source
        group by activity_source.date
        order by activity_source.date desc
        limit 14
      ) as latest_activity
      order by latest_activity.date
    ) as activity_rows
  ),
  responder_modes as (
    select jsonb_build_array(
      jsonb_build_object(
        'label', 'Anonymous',
        'value',
          coalesce((
            select count(*)::int
            from responses
            where respondent_user_id is null
              and (respondent_email is null or btrim(respondent_email) = '')
          ), 0)
      ),
      jsonb_build_object(
        'label', 'Logged in',
        'value',
          coalesce((
            select count(*)::int
            from responses
            where respondent_user_id is not null
              and (respondent_email is null or btrim(respondent_email) = '')
          ), 0)
      ),
      jsonb_build_object(
        'label', 'Logged in + email',
        'value',
          coalesce((
            select count(*)::int
            from responses
            where respondent_user_id is not null
              and respondent_email is not null
              and btrim(respondent_email) <> ''
          ), 0)
      )
    ) as data
  ),
  top_referrers as (
    select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', value)), '[]'::jsonb) as data
    from (
      select referrer_domain as label, count(*)::int as value
      from sessions
      where referrer_domain is not null
        and btrim(referrer_domain) <> ''
      group by referrer_domain
      order by value desc, label
      limit 5
    ) ranked
  ),
  devices as (
    select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', value)), '[]'::jsonb) as data
    from (
      select device_type as label, count(*)::int as value
      from sessions
      where device_type is not null
        and btrim(device_type) <> ''
      group by device_type
      order by value desc, label
    ) ranked
  ),
  browsers as (
    select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', value)), '[]'::jsonb) as data
    from (
      select browser as label, count(*)::int as value
      from sessions
      where browser is not null
        and btrim(browser) <> ''
      group by browser
      order by value desc, label
    ) ranked
  ),
  operating_systems as (
    select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', value)), '[]'::jsonb) as data
    from (
      select os as label, count(*)::int as value
      from sessions
      where os is not null
        and btrim(os) <> ''
      group by os
      order by value desc, label
    ) ranked
  ),
  countries as (
    select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', value)), '[]'::jsonb) as data
    from (
      select country as label, count(*)::int as value
      from sessions
      where country is not null
        and btrim(country) <> ''
      group by country
      order by value desc, label
      limit 6
    ) ranked
  ),
  cities as (
    select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', value)), '[]'::jsonb) as data
    from (
      select city as label, count(*)::int as value
      from sessions
      where city is not null
        and btrim(city) <> ''
      group by city
      order by value desc, label
      limit 6
    ) ranked
  ),
  dropoff_by_section as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'sectionId', sc.id,
          'title', sc.title,
          'count', coalesce(section_counts.count, 0)
        )
        order by sc.position
      ),
      '[]'::jsonb
    ) as data
    from section_catalog sc
    left join (
      select last_section_id, count(*)::int as count
      from sessions
      where submitted_at is null
        and last_section_id is not null
      group by last_section_id
    ) section_counts on section_counts.last_section_id = sc.id
  ),
  dropoff_by_question as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'questionId', qc.id,
          'title', qc.title,
          'count', coalesce(question_counts.count, 0)
        )
        order by qc.section_position, qc.question_position
      ),
      '[]'::jsonb
    ) as data
    from question_catalog qc
    left join (
      select last_question_id, count(*)::int as count
      from sessions
      where submitted_at is null
        and last_question_id is not null
      group by last_question_id
    ) question_counts on question_counts.last_question_id = qc.id
  )
  select jsonb_build_object(
    'totalViews', totals.total_views,
    'totalStarts', totals.total_starts,
    'totalSubmissions', totals.total_submissions,
    'totalAbandons', greatest(totals.total_starts - totals.total_submissions, 0),
    'startRate',
      case
        when totals.total_views = 0 then 0
        else round(totals.total_starts * 100.0 / totals.total_views)::int
      end,
    'completionRate',
      case
        when totals.total_views = 0 then 0
        else round(totals.total_submissions * 100.0 / totals.total_views)::int
      end,
    'completionFromStartsRate',
      case
        when totals.total_starts = 0 then 0
        else round(totals.total_submissions * 100.0 / totals.total_starts)::int
      end,
    'avgCompletionSeconds', totals.avg_completion_seconds,
    'uniqueReferrers', totals.unique_referrers,
    'uniqueCountries', totals.unique_countries,
    'responderModeBreakdown', responder_modes.data,
    'topReferrers', top_referrers.data,
    'devices', devices.data,
    'browsers', browsers.data,
    'operatingSystems', operating_systems.data,
    'countries', countries.data,
    'cities', cities.data,
    'dropoffBySection', dropoff_by_section.data,
    'dropoffByQuestion', dropoff_by_question.data,
    'activity', activity.data
  )
  from totals
  cross join responder_modes
  cross join top_referrers
  cross join devices
  cross join browsers
  cross join operating_systems
  cross join countries
  cross join cities
  cross join dropoff_by_section
  cross join dropoff_by_question
  cross join activity;
$$;

revoke all on function private.get_form_workspace_id(uuid)
from public, anon, authenticated;
revoke all on function private.can_manage_form(uuid)
from public, anon, authenticated;
revoke all on function private.can_view_form_analytics(uuid)
from public, anon, authenticated;
revoke all on function private.form_id_from_section(uuid)
from public, anon, authenticated;
revoke all on function private.form_id_from_question(uuid)
from public, anon, authenticated;
revoke all on function private.form_id_from_share_link(uuid)
from public, anon, authenticated;
revoke all on function private.form_id_from_response(uuid)
from public, anon, authenticated;
revoke all on function private.touch_form_updated_at()
from public, anon, authenticated;
revoke all on function private.get_form_matched_response_ids(uuid, text)
from public, anon, authenticated;
revoke all on function private.get_form_response_page(uuid, text, integer, integer)
from public, anon, authenticated;
revoke all on function private.get_form_response_rollups(uuid, text)
from public, anon, authenticated;
revoke all on function private.get_form_analytics_overview(uuid)
from public, anon, authenticated;

grant execute on function private.get_form_workspace_id(uuid)
to service_role;
grant execute on function private.can_manage_form(uuid)
to service_role;
grant execute on function private.can_view_form_analytics(uuid)
to service_role;
grant execute on function private.form_id_from_section(uuid)
to service_role;
grant execute on function private.form_id_from_question(uuid)
to service_role;
grant execute on function private.form_id_from_share_link(uuid)
to service_role;
grant execute on function private.form_id_from_response(uuid)
to service_role;
grant execute on function private.touch_form_updated_at()
to service_role;
grant execute on function private.get_form_matched_response_ids(uuid, text)
to service_role;
grant execute on function private.get_form_response_page(uuid, text, integer, integer)
to service_role;
grant execute on function private.get_form_response_rollups(uuid, text)
to service_role;
grant execute on function private.get_form_analytics_overview(uuid)
to service_role;
