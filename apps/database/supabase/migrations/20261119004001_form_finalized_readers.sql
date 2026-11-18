-- A response linked to a Forms session is visible after that session commits.
-- Sessionless historical responses already store their committed timestamp.
create view private.form_committed_responses
with (security_invoker = true)
as
select response.*
from private.form_responses as response
where response.session_id is null
   or exists (
     select 1
     from private.form_sessions as response_session
     where response_session.id = response.session_id
       and response_session.form_id = response.form_id
       and response_session.submitted_at is not null
   );

revoke all on private.form_committed_responses from public, anon, authenticated, service_role;
grant select on private.form_committed_responses to service_role;

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
  from private.form_committed_responses r
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

revoke all on function private.get_form_matched_response_ids(uuid, text)
  from public, anon, authenticated;
grant execute on function private.get_form_matched_response_ids(uuid, text) to service_role;

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
    from private.form_committed_responses
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

revoke all on function private.get_form_analytics_overview(uuid)
  from public, anon, authenticated;
grant execute on function private.get_form_analytics_overview(uuid) to service_role;
