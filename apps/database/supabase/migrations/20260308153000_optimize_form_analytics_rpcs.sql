CREATE OR REPLACE FUNCTION "public"."get_form_matched_response_ids"(
  p_form_id uuid,
  p_query text DEFAULT NULL
)
RETURNS TABLE ("response_id" uuid)
LANGUAGE sql
STABLE
AS $$
  WITH normalized_query AS (
    SELECT NULLIF(BTRIM(p_query), '') AS query
  )
  SELECT r.id AS response_id
  FROM public.form_responses r
  CROSS JOIN normalized_query nq
  WHERE r.form_id = p_form_id
    AND (
      nq.query IS NULL
      OR COALESCE(r.respondent_email, '') ILIKE '%' || nq.query || '%'
      OR EXISTS (
        SELECT 1
        FROM public.form_response_answers a
        WHERE a.response_id = r.id
          AND (
            COALESCE(a.question_title, '') ILIKE '%' || nq.query || '%'
            OR COALESCE(a.answer_text, '') ILIKE '%' || nq.query || '%'
            OR COALESCE(a.answer_json::text, '') ILIKE '%' || nq.query || '%'
          )
      )
    );
$$;

CREATE OR REPLACE FUNCTION "public"."get_form_response_page"(
  p_form_id uuid,
  p_query text DEFAULT NULL,
  p_page_size integer DEFAULT 10,
  p_page integer DEFAULT 1
)
RETURNS TABLE (
  "id" uuid,
  "session_id" uuid,
  "created_at" timestamptz,
  "submitted_at" timestamptz,
  "respondent_email" text,
  "respondent_user_id" uuid,
  "total_count" bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH paging AS (
    SELECT
      GREATEST(COALESCE(p_page_size, 10), 1) AS page_size,
      GREATEST(COALESCE(p_page, 1), 1) AS page_number
  ),
  matched AS (
    SELECT
      r.id,
      r.session_id,
      r.created_at,
      r.submitted_at,
      r.respondent_email,
      r.respondent_user_id
    FROM public.form_responses r
    JOIN public.get_form_matched_response_ids(p_form_id, p_query) matched_ids
      ON matched_ids.response_id = r.id
  ),
  numbered AS (
    SELECT
      m.id,
      m.session_id,
      m.created_at,
      m.submitted_at,
      m.respondent_email,
      m.respondent_user_id,
      COUNT(*) OVER () AS total_count,
      ROW_NUMBER() OVER (ORDER BY m.submitted_at DESC) AS row_number
    FROM matched m
  )
  SELECT
    numbered.id,
    numbered.session_id,
    numbered.created_at,
    numbered.submitted_at,
    numbered.respondent_email,
    numbered.respondent_user_id,
    numbered.total_count
  FROM numbered
  CROSS JOIN paging
  WHERE numbered.row_number > (paging.page_number - 1) * paging.page_size
    AND numbered.row_number <= paging.page_number * paging.page_size
  ORDER BY numbered.row_number;
$$;

CREATE OR REPLACE FUNCTION "public"."get_form_response_rollups"(
  p_form_id uuid,
  p_query text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH matched_responses AS (
    SELECT r.*
    FROM public.form_responses r
    JOIN public.get_form_matched_response_ids(p_form_id, p_query) matched_ids
      ON matched_ids.response_id = r.id
  ),
  question_catalog AS (
    SELECT
      q.id,
      q.type,
      COALESCE(NULLIF(q.title, ''), 'Untitled question') AS title,
      q.position AS question_position,
      s.position AS section_position
    FROM public.form_questions q
    JOIN public.form_sections s ON s.id = q.section_id
    WHERE q.form_id = p_form_id
      AND q.type <> 'section_break'
  ),
  answer_rows AS (
    SELECT
      a.response_id,
      a.question_id,
      qc.type,
      a.answer_text,
      a.answer_json
    FROM public.form_response_answers a
    JOIN matched_responses r ON r.id = a.response_id
    JOIN question_catalog qc ON qc.id = a.question_id
  ),
  scalar_answers AS (
    SELECT
      ar.question_id,
      ar.type,
      CASE
        WHEN ar.answer_text IS NOT NULL AND BTRIM(ar.answer_text) <> '' THEN ar.answer_text
        WHEN ar.answer_json IS NULL THEN NULL
        WHEN jsonb_typeof(ar.answer_json) = 'string'
          THEN TRIM(BOTH '"' FROM ar.answer_json::text)
        WHEN jsonb_typeof(ar.answer_json) IN ('number', 'boolean')
          THEN ar.answer_json::text
        ELSE NULL
      END AS answer_value
    FROM answer_rows ar
  ),
  array_answers AS (
    SELECT
      ar.question_id,
      ar.type,
      choice.value AS answer_value
    FROM answer_rows ar
    CROSS JOIN LATERAL jsonb_array_elements_text(ar.answer_json) AS choice(value)
    WHERE ar.type = 'multiple_choice'
      AND ar.answer_json IS NOT NULL
      AND jsonb_typeof(ar.answer_json) = 'array'
  ),
  answer_value_counts AS (
    SELECT
      values_by_question.question_id,
      values_by_question.answer_value,
      COUNT(*)::int AS count
    FROM (
      SELECT
        sa.question_id,
        sa.answer_value
      FROM scalar_answers sa
      WHERE sa.type IN ('single_choice', 'dropdown', 'rating', 'linear_scale')
        AND sa.answer_value IS NOT NULL
        AND BTRIM(sa.answer_value) <> ''

      UNION ALL

      SELECT
        aa.question_id,
        aa.answer_value
      FROM array_answers aa
      WHERE aa.answer_value IS NOT NULL
        AND BTRIM(aa.answer_value) <> ''
    ) AS values_by_question
    GROUP BY values_by_question.question_id, values_by_question.answer_value
  ),
  question_totals AS (
    SELECT
      ar.question_id,
      COUNT(*)::int AS total_answers
    FROM answer_rows ar
    GROUP BY ar.question_id
  ),
  mean_scores AS (
    SELECT
      sa.question_id,
      ROUND(AVG(sa.answer_value::numeric), 1) AS mean_score
    FROM scalar_answers sa
    WHERE sa.type IN ('rating', 'linear_scale')
      AND sa.answer_value ~ '^-?\d+(\.\d+)?$'
    GROUP BY sa.question_id
  ),
  response_summary AS (
    SELECT
      COUNT(*)::int AS total_submissions,
      COUNT(DISTINCT
        CASE
          WHEN r.respondent_user_id IS NOT NULL
            THEN 'user:' || r.respondent_user_id::text
          WHEN r.respondent_email IS NOT NULL AND BTRIM(r.respondent_email) <> ''
            THEN 'email:' || LOWER(r.respondent_email)
          ELSE 'anon:' || r.id::text
        END
      )::int AS total_responders,
      COUNT(DISTINCT r.respondent_user_id) FILTER (
        WHERE r.respondent_user_id IS NOT NULL
      )::int AS authenticated_responders,
      COUNT(*) FILTER (
        WHERE r.respondent_user_id IS NULL
          AND (r.respondent_email IS NULL OR BTRIM(r.respondent_email) = '')
      )::int AS anonymous_submissions
    FROM matched_responses r
  ),
  duplicate_authenticated AS (
    SELECT
      COUNT(*)::int AS duplicate_authenticated_responders,
      COALESCE(SUM(user_counts.response_count), 0)::int AS duplicate_authenticated_submissions
    FROM (
      SELECT
        r.respondent_user_id,
        COUNT(*)::int AS response_count
      FROM matched_responses r
      WHERE r.respondent_user_id IS NOT NULL
      GROUP BY r.respondent_user_id
      HAVING COUNT(*) > 1
    ) AS user_counts
  ),
  question_analytics AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'questionId', qc.id,
            'title', qc.title,
            'type', qc.type,
            'totalAnswers', COALESCE(qt.total_answers, 0),
            'choices',
              CASE
                WHEN qc.type IN ('single_choice', 'multiple_choice', 'dropdown')
                  THEN COALESCE((
                    SELECT jsonb_agg(
                      jsonb_build_object(
                        'label', qo.label,
                        'value', qo.value,
                        'count', COALESCE(avc.count, 0),
                        'percentage',
                          CASE
                            WHEN rs.total_submissions = 0 THEN 0
                            ELSE ROUND(COALESCE(avc.count, 0) * 100.0 / rs.total_submissions)::int
                          END
                      )
                      ORDER BY qo.position
                    )
                    FROM public.form_question_options qo
                    LEFT JOIN answer_value_counts avc
                      ON avc.question_id = qc.id
                     AND avc.answer_value = qo.value
                    CROSS JOIN response_summary rs
                    WHERE qo.question_id = qc.id
                  ), '[]'::jsonb)
                ELSE NULL
              END,
            'scale',
              CASE
                WHEN qc.type IN ('rating', 'linear_scale')
                  THEN COALESCE((
                    SELECT jsonb_agg(
                      jsonb_build_object(
                        'score', qo.value,
                        'label', qo.label,
                        'count', COALESCE(avc.count, 0),
                        'percentage',
                          CASE
                            WHEN rs.total_submissions = 0 THEN 0
                            ELSE ROUND(COALESCE(avc.count, 0) * 100.0 / rs.total_submissions)::int
                          END
                      )
                      ORDER BY qo.position
                    )
                    FROM public.form_question_options qo
                    LEFT JOIN answer_value_counts avc
                      ON avc.question_id = qc.id
                     AND avc.answer_value = qo.value
                    CROSS JOIN response_summary rs
                    WHERE qo.question_id = qc.id
                  ), '[]'::jsonb)
                ELSE NULL
              END,
            'meanScore',
              CASE
                WHEN qc.type IN ('rating', 'linear_scale')
                  THEN ms.mean_score
                ELSE NULL
              END
          )
        )
        ORDER BY qc.section_position, qc.question_position
      ),
      '[]'::jsonb
    ) AS data
    FROM question_catalog qc
    LEFT JOIN question_totals qt ON qt.question_id = qc.id
    LEFT JOIN mean_scores ms ON ms.question_id = qc.id
  )
  SELECT jsonb_build_object(
    'total', COALESCE((SELECT total_submissions FROM response_summary), 0),
    'summary', jsonb_build_object(
      'totalSubmissions', COALESCE((SELECT total_submissions FROM response_summary), 0),
      'totalResponders', COALESCE((SELECT total_responders FROM response_summary), 0),
      'authenticatedResponders', COALESCE((SELECT authenticated_responders FROM response_summary), 0),
      'anonymousSubmissions', COALESCE((SELECT anonymous_submissions FROM response_summary), 0),
      'duplicateAuthenticatedResponders', COALESCE((SELECT duplicate_authenticated_responders FROM duplicate_authenticated), 0),
      'duplicateAuthenticatedSubmissions', COALESCE((SELECT duplicate_authenticated_submissions FROM duplicate_authenticated), 0),
      'hasMultipleSubmissionsByUser',
        COALESCE((SELECT duplicate_authenticated_responders FROM duplicate_authenticated), 0) > 0
    ),
    'questionAnalytics', COALESCE((SELECT data FROM question_analytics), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION "public"."get_form_analytics_overview"(p_form_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH sessions AS (
    SELECT *
    FROM public.form_sessions
    WHERE form_id = p_form_id
  ),
  responses AS (
    SELECT *
    FROM public.form_responses
    WHERE form_id = p_form_id
  ),
  section_catalog AS (
    SELECT
      s.id,
      COALESCE(NULLIF(s.title, ''), 'Untitled section') AS title,
      s.position
    FROM public.form_sections s
    WHERE s.form_id = p_form_id
  ),
  question_catalog AS (
    SELECT
      q.id,
      COALESCE(NULLIF(q.title, ''), 'Untitled question') AS title,
      q.position AS question_position,
      s.position AS section_position
    FROM public.form_questions q
    JOIN public.form_sections s ON s.id = q.section_id
    WHERE q.form_id = p_form_id
      AND q.type <> 'section_break'
  ),
  totals AS (
    SELECT
      (SELECT COUNT(*)::int FROM sessions) AS total_views,
      (SELECT COUNT(*)::int FROM sessions WHERE started_at IS NOT NULL) AS total_starts,
      (SELECT COUNT(*)::int FROM responses) AS total_submissions,
      COALESCE(
        (SELECT ROUND(AVG(duration_seconds))::int FROM responses WHERE duration_seconds > 0),
        0
      ) AS avg_completion_seconds,
      (SELECT COUNT(DISTINCT referrer_domain)::int
       FROM sessions
       WHERE referrer_domain IS NOT NULL AND BTRIM(referrer_domain) <> '') AS unique_referrers,
      (SELECT COUNT(DISTINCT country)::int
       FROM sessions
       WHERE country IS NOT NULL AND BTRIM(country) <> '') AS unique_countries
  ),
  activity AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'date', activity_rows.date,
          'views', activity_rows.views,
          'starts', activity_rows.starts,
          'submissions', activity_rows.submissions
        )
        ORDER BY activity_rows.date
      ),
      '[]'::jsonb
    ) AS data
    FROM (
      SELECT *
      FROM (
        SELECT
          activity_source.date,
          SUM(activity_source.views)::int AS views,
          SUM(activity_source.starts)::int AS starts,
          SUM(activity_source.submissions)::int AS submissions
        FROM (
          SELECT viewed_at::date AS date, 1 AS views, 0 AS starts, 0 AS submissions
          FROM sessions

          UNION ALL

          SELECT started_at::date AS date, 0 AS views, 1 AS starts, 0 AS submissions
          FROM sessions
          WHERE started_at IS NOT NULL

          UNION ALL

          SELECT submitted_at::date AS date, 0 AS views, 0 AS starts, 1 AS submissions
          FROM responses
        ) AS activity_source
        GROUP BY activity_source.date
        ORDER BY activity_source.date DESC
        LIMIT 14
      ) AS latest_activity
      ORDER BY latest_activity.date
    ) AS activity_rows
  ),
  responder_modes AS (
    SELECT jsonb_build_array(
      jsonb_build_object(
        'label', 'Anonymous',
        'value',
          COALESCE((
            SELECT COUNT(*)::int
            FROM responses
            WHERE respondent_user_id IS NULL
              AND (respondent_email IS NULL OR BTRIM(respondent_email) = '')
          ), 0)
      ),
      jsonb_build_object(
        'label', 'Logged in',
        'value',
          COALESCE((
            SELECT COUNT(*)::int
            FROM responses
            WHERE respondent_user_id IS NOT NULL
              AND (respondent_email IS NULL OR BTRIM(respondent_email) = '')
          ), 0)
      ),
      jsonb_build_object(
        'label', 'Logged in + email',
        'value',
          COALESCE((
            SELECT COUNT(*)::int
            FROM responses
            WHERE respondent_user_id IS NOT NULL
              AND respondent_email IS NOT NULL
              AND BTRIM(respondent_email) <> ''
          ), 0)
      )
    ) AS data
  ),
  top_referrers AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'value', value)), '[]'::jsonb) AS data
    FROM (
      SELECT referrer_domain AS label, COUNT(*)::int AS value
      FROM sessions
      WHERE referrer_domain IS NOT NULL
        AND BTRIM(referrer_domain) <> ''
      GROUP BY referrer_domain
      ORDER BY value DESC, label
      LIMIT 5
    ) ranked
  ),
  devices AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'value', value)), '[]'::jsonb) AS data
    FROM (
      SELECT device_type AS label, COUNT(*)::int AS value
      FROM sessions
      WHERE device_type IS NOT NULL
        AND BTRIM(device_type) <> ''
      GROUP BY device_type
      ORDER BY value DESC, label
    ) ranked
  ),
  browsers AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'value', value)), '[]'::jsonb) AS data
    FROM (
      SELECT browser AS label, COUNT(*)::int AS value
      FROM sessions
      WHERE browser IS NOT NULL
        AND BTRIM(browser) <> ''
      GROUP BY browser
      ORDER BY value DESC, label
    ) ranked
  ),
  operating_systems AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'value', value)), '[]'::jsonb) AS data
    FROM (
      SELECT os AS label, COUNT(*)::int AS value
      FROM sessions
      WHERE os IS NOT NULL
        AND BTRIM(os) <> ''
      GROUP BY os
      ORDER BY value DESC, label
    ) ranked
  ),
  countries AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'value', value)), '[]'::jsonb) AS data
    FROM (
      SELECT country AS label, COUNT(*)::int AS value
      FROM sessions
      WHERE country IS NOT NULL
        AND BTRIM(country) <> ''
      GROUP BY country
      ORDER BY value DESC, label
      LIMIT 6
    ) ranked
  ),
  cities AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'value', value)), '[]'::jsonb) AS data
    FROM (
      SELECT city AS label, COUNT(*)::int AS value
      FROM sessions
      WHERE city IS NOT NULL
        AND BTRIM(city) <> ''
      GROUP BY city
      ORDER BY value DESC, label
      LIMIT 6
    ) ranked
  ),
  dropoff_by_section AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'sectionId', sc.id,
          'title', sc.title,
          'count', COALESCE(section_counts.count, 0)
        )
        ORDER BY sc.position
      ),
      '[]'::jsonb
    ) AS data
    FROM section_catalog sc
    LEFT JOIN (
      SELECT last_section_id, COUNT(*)::int AS count
      FROM sessions
      WHERE submitted_at IS NULL
        AND last_section_id IS NOT NULL
      GROUP BY last_section_id
    ) section_counts ON section_counts.last_section_id = sc.id
  ),
  dropoff_by_question AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'questionId', qc.id,
          'title', qc.title,
          'count', COALESCE(question_counts.count, 0)
        )
        ORDER BY qc.section_position, qc.question_position
      ),
      '[]'::jsonb
    ) AS data
    FROM question_catalog qc
    LEFT JOIN (
      SELECT last_question_id, COUNT(*)::int AS count
      FROM sessions
      WHERE submitted_at IS NULL
        AND last_question_id IS NOT NULL
      GROUP BY last_question_id
    ) question_counts ON question_counts.last_question_id = qc.id
  )
  SELECT jsonb_build_object(
    'totalViews', totals.total_views,
    'totalStarts', totals.total_starts,
    'totalSubmissions', totals.total_submissions,
    'totalAbandons', GREATEST(totals.total_starts - totals.total_submissions, 0),
    'startRate',
      CASE
        WHEN totals.total_views = 0 THEN 0
        ELSE ROUND(totals.total_starts * 100.0 / totals.total_views)::int
      END,
    'completionRate',
      CASE
        WHEN totals.total_views = 0 THEN 0
        ELSE ROUND(totals.total_submissions * 100.0 / totals.total_views)::int
      END,
    'completionFromStartsRate',
      CASE
        WHEN totals.total_starts = 0 THEN 0
        ELSE ROUND(totals.total_submissions * 100.0 / totals.total_starts)::int
      END,
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
  FROM totals
  CROSS JOIN responder_modes
  CROSS JOIN top_referrers
  CROSS JOIN devices
  CROSS JOIN browsers
  CROSS JOIN operating_systems
  CROSS JOIN countries
  CROSS JOIN cities
  CROSS JOIN dropoff_by_section
  CROSS JOIN dropoff_by_question
  CROSS JOIN activity;
$$;
