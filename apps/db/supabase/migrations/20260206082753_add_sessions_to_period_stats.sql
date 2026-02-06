-- RPC: Aggregate time-tracking period stats server-side for performance
-- Updated to properly calculate daily breakdown by splitting multi-day sessions
CREATE OR REPLACE FUNCTION public.get_time_tracking_period_stats(
	p_ws_id UUID,
	p_user_id UUID,
	p_date_from TIMESTAMPTZ,
	p_date_to TIMESTAMPTZ,
	p_timezone TEXT DEFAULT 'UTC',
	p_category_id UUID DEFAULT NULL,
	p_task_id UUID DEFAULT NULL,
	p_search_query TEXT DEFAULT NULL,
	p_duration TEXT DEFAULT NULL,
	p_time_of_day TEXT DEFAULT NULL,
	p_project_context TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
	v_total_duration BIGINT;
	v_session_count INTEGER;
	v_time_of_day JSONB;
	v_best_time_of_day TEXT;
	v_longest_session JSONB;
	v_breakdown JSONB;
	v_daily_breakdown JSONB;
	v_short_sessions INTEGER;
	v_medium_sessions INTEGER;
	v_long_sessions INTEGER;
BEGIN
	WITH base AS (
		SELECT
			s.id,
			s.title,
			s.description,
			s.start_time,
			s.end_time,
			s.duration_seconds,
			s.category_id,
			s.task_id,
			c.id AS cat_id,
			c.name AS cat_name,
			c.color AS cat_color,
			(s.start_time AT TIME ZONE p_timezone) AS start_local,
			(COALESCE(s.end_time, NOW()) AT TIME ZONE p_timezone) AS end_local,
			(p_date_from AT TIME ZONE p_timezone) AS period_start_local,
			(p_date_to AT TIME ZONE p_timezone) AS period_end_local
		FROM public.time_tracking_sessions s
		LEFT JOIN public.time_tracking_categories c ON s.category_id = c.id
		WHERE s.ws_id = p_ws_id
			AND s.user_id = p_user_id
			AND s.pending_approval = FALSE
			AND s.start_time < p_date_to
			AND (s.end_time >= p_date_from OR s.end_time IS NULL)
			AND (p_category_id IS NULL OR s.category_id = p_category_id)
			AND (p_task_id IS NULL OR s.task_id = p_task_id)
			AND (
				p_search_query IS NULL
				OR s.title ILIKE '%' || p_search_query || '%'
				OR s.description ILIKE '%' || p_search_query || '%'
			)
	),
	with_overlap AS (
		SELECT
			*,
			GREATEST(
				0,
				EXTRACT(
					EPOCH FROM LEAST(end_local, period_end_local)
					- GREATEST(start_local, period_start_local)
				)
			)::BIGINT AS overlap_seconds,
			CASE
				WHEN EXTRACT(HOUR FROM start_local) >= 6 AND EXTRACT(HOUR FROM start_local) < 12 THEN 'morning'
				WHEN EXTRACT(HOUR FROM start_local) >= 12 AND EXTRACT(HOUR FROM start_local) < 18 THEN 'afternoon'
				WHEN EXTRACT(HOUR FROM start_local) >= 18 AND EXTRACT(HOUR FROM start_local) < 24 THEN 'evening'
				ELSE 'night'
			END AS time_of_day,
			CASE
				WHEN task_id IS NOT NULL THEN 'project-work'
				WHEN LOWER(COALESCE(cat_name, '')) LIKE '%meeting%' THEN 'meetings'
				WHEN LOWER(COALESCE(cat_name, '')) LIKE '%learn%' THEN 'learning'
				WHEN LOWER(COALESCE(cat_name, '')) LIKE '%admin%' THEN 'administrative'
				ELSE 'general'
			END AS project_context,
			COALESCE(cat_id::TEXT, 'uncategorized') AS breakdown_id,
			COALESCE(cat_name, 'No Category') AS breakdown_name,
			COALESCE(cat_color, 'GRAY') AS breakdown_color
		FROM base
	),
	filtered AS (
		SELECT *
		FROM with_overlap
		WHERE overlap_seconds > 0
			AND (
				p_duration IS NULL
				OR p_duration = 'all'
				OR (p_duration = 'short' AND overlap_seconds < 1800)
				OR (p_duration = 'medium' AND overlap_seconds >= 1800 AND overlap_seconds < 7200)
				OR (p_duration = 'long' AND overlap_seconds >= 7200)
			)
			AND (p_time_of_day IS NULL OR p_time_of_day = 'all' OR time_of_day = p_time_of_day)
			AND (p_project_context IS NULL OR p_project_context = 'all' OR project_context = p_project_context)
	),
	days AS (
		-- Generate all days in the period to split multi-day sessions
		SELECT generate_series(
			(p_date_from AT TIME ZONE p_timezone)::DATE,
			(p_date_to AT TIME ZONE p_timezone)::DATE,
			'1 day'::INTERVAL
		)::DATE AS d
	),
	daily_stats AS (
		-- Calculate overlap per day for each session
		SELECT
			d.d::TEXT AS day_date,
			f.breakdown_id,
			f.breakdown_name,
			f.breakdown_color,
			SUM(
				GREATEST(
					0,
					EXTRACT(
						EPOCH FROM LEAST(f.end_local, (d.d + 1)::TIMESTAMP)
						- GREATEST(f.start_local, d.d::TIMESTAMP)
					)
				)
			)::BIGINT AS cat_duration
		FROM days d
		CROSS JOIN filtered f
		WHERE f.start_local < (d.d + 1)::TIMESTAMP
		  AND f.end_local >= d.d::TIMESTAMP
		GROUP BY 1, 2, 3, 4
		HAVING SUM(
			GREATEST(
				0,
				EXTRACT(
					EPOCH FROM LEAST(f.end_local, (d.d + 1)::TIMESTAMP)
					- GREATEST(f.start_local, d.d::TIMESTAMP)
				)
			)
		) > 0
	)
	SELECT
		COALESCE(SUM(overlap_seconds), 0)::BIGINT,
		COUNT(*)::INTEGER,
		JSONB_BUILD_OBJECT(
			'morning', COALESCE(SUM(CASE WHEN time_of_day = 'morning' THEN 1 ELSE 0 END), 0),
			'afternoon', COALESCE(SUM(CASE WHEN time_of_day = 'afternoon' THEN 1 ELSE 0 END), 0),
			'evening', COALESCE(SUM(CASE WHEN time_of_day = 'evening' THEN 1 ELSE 0 END), 0),
			'night', COALESCE(SUM(CASE WHEN time_of_day = 'night' THEN 1 ELSE 0 END), 0)
		),
		(
			SELECT time_of_day
			FROM (
				SELECT time_of_day, COUNT(*) AS cnt
				FROM filtered
				GROUP BY time_of_day
				ORDER BY cnt DESC, time_of_day ASC
				LIMIT 1
			) t
		),
		(
			SELECT JSONB_BUILD_OBJECT(
				'title', title,
				'duration_seconds', overlap_seconds
			)
			FROM filtered
			ORDER BY overlap_seconds DESC, start_time ASC
			LIMIT 1
		),
		(
			SELECT COALESCE(
				JSONB_AGG(
					JSONB_BUILD_OBJECT(
						'name', breakdown_name,
						'duration', total_duration,
						'color', breakdown_color
					)
					ORDER BY total_duration DESC
				),
				'[]'::JSONB
			)
			FROM (
				SELECT breakdown_id, breakdown_name, breakdown_color, SUM(overlap_seconds) AS total_duration
				FROM filtered
				GROUP BY breakdown_id, breakdown_name, breakdown_color
				HAVING SUM(overlap_seconds) > 0
			) b
		),
		(
			SELECT COALESCE(
				JSONB_AGG(
					JSONB_BUILD_OBJECT(
						'date', day_date,
						'totalDuration', day_total,
						'breakdown', day_categories
					)
					ORDER BY day_date
				),
				'[]'::JSONB
			)
			FROM (
				SELECT
					day_date,
					SUM(cat_duration) AS day_total,
					JSONB_AGG(
						JSONB_BUILD_OBJECT(
							'categoryId', breakdown_id,
							'name', breakdown_name,
							'color', breakdown_color,
							'duration', cat_duration
						)
						ORDER BY cat_duration DESC
					) AS day_categories
				FROM daily_stats
				GROUP BY 1
			) d
		),
		COALESCE(SUM(CASE WHEN overlap_seconds < 1800 THEN 1 ELSE 0 END), 0)::INTEGER,
		COALESCE(SUM(CASE WHEN overlap_seconds >= 1800 AND overlap_seconds < 7200 THEN 1 ELSE 0 END), 0)::INTEGER,
		COALESCE(SUM(CASE WHEN overlap_seconds >= 7200 THEN 1 ELSE 0 END), 0)::INTEGER
	INTO
		v_total_duration,
		v_session_count,
		v_time_of_day,
		v_best_time_of_day,
		v_longest_session,
		v_breakdown,
		v_daily_breakdown,
		v_short_sessions,
		v_medium_sessions,
		v_long_sessions
	FROM filtered;

	RETURN JSONB_BUILD_OBJECT(
		'totalDuration', v_total_duration,
		'breakdown', v_breakdown,
		'timeOfDayBreakdown', v_time_of_day,
		'bestTimeOfDay', COALESCE(v_best_time_of_day, 'none'),
		'longestSession', v_longest_session,
		'dailyBreakdown', v_daily_breakdown,
		'shortSessions', v_short_sessions,
		'mediumSessions', v_medium_sessions,
		'longSessions', v_long_sessions,
		'sessionCount', v_session_count
	);
END;
$$ LANGUAGE plpgsql STABLE;
