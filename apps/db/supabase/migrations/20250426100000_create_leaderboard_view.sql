drop view if exists nova_user_leaderboard
drop view if exists nova_user_challenge_leaderboard
drop view if exists nova_team_leaderboard
drop view if exists nova_team_challenge_leaderboard





CREATE OR REPLACE VIEW nova_user_leaderboard AS
WITH problem_best_submissions_per_session AS (
    -- Get the best submission for each problem by user in each session
    SELECT
        s.user_id,
        s.session_id,
        s.problem_id,
        MAX(s.total_score) AS best_score
    FROM
        nova_submissions_with_scores s
    GROUP BY
        s.user_id, s.session_id, s.problem_id
),
problem_challenge_map AS (
    -- Map each problem to its challenge
    SELECT
        p.id AS problem_id,
        p.challenge_id
    FROM
        nova_problems p
),
session_challenge_scores AS (
    -- Calculate total score for each session by challenge
    SELECT
        pbs.user_id,
        pbs.session_id,
        pcm.challenge_id,
        SUM(pbs.best_score) AS session_score
    FROM
        problem_best_submissions_per_session pbs
    JOIN
        problem_challenge_map pcm ON pbs.problem_id = pcm.problem_id
    GROUP BY
        pbs.user_id, pbs.session_id, pcm.challenge_id
),
best_session_per_challenge AS (
    -- Find the best session for each challenge
    SELECT DISTINCT ON (user_id, challenge_id)
        user_id,
        challenge_id,
        session_score
    FROM
        session_challenge_scores
    ORDER BY
        user_id, challenge_id, session_score DESC
),
challenge_scores_json AS (
    -- Convert challenge scores to JSON for each user
    SELECT
        user_id,
        jsonb_object_agg(challenge_id, session_score) AS challenge_scores
    FROM
        best_session_per_challenge
    GROUP BY
        user_id
),
user_total_scores AS (
    -- Calculate total score as sum of best session scores per challenge
    SELECT
        user_id,
        SUM(session_score) AS total_score
    FROM
        best_session_per_challenge
    GROUP BY
        user_id
)
SELECT
    u.id as user_id,
    COALESCE(u.display_name, 'User ' || u.id) AS name,
    u.avatar_url AS avatar,
    COALESCE(uts.total_score, 0) AS score,
    COALESCE(csj.challenge_scores, '{}'::jsonb) AS challenge_scores
FROM
    users u
LEFT JOIN
    user_total_scores uts ON u.id = uts.user_id
LEFT JOIN
    challenge_scores_json csj ON u.id = csj.user_id
ORDER BY
    score DESC, name;





CREATE OR REPLACE VIEW nova_user_challenge_leaderboard AS
WITH problem_best_submissions_per_session AS (
    -- Get the best submission for each problem by user in each session
    SELECT
        s.user_id,
        s.session_id,
        s.problem_id,
        MAX(s.total_score) AS best_score
    FROM
        nova_submissions_with_scores s
    GROUP BY
        s.user_id, s.session_id, s.problem_id
),
problem_challenge_map AS (
    -- Map each problem to its challenge
    SELECT
        p.id AS problem_id,
        p.challenge_id,
        p.title AS problem_title
    FROM
        nova_problems p
),
session_challenge_scores AS (
    -- Calculate total score for each session by challenge
    SELECT
        pbs.user_id,
        pbs.session_id,
        pcm.challenge_id,
        SUM(pbs.best_score) AS session_score,
        jsonb_agg(
            jsonb_build_object(
                'id', pbs.problem_id,
                'title', pcm.problem_title,
                'score', pbs.best_score
            )
        ) AS problems_in_session
    FROM
        problem_best_submissions_per_session pbs
    JOIN
        problem_challenge_map pcm ON pbs.problem_id = pcm.problem_id
    GROUP BY
        pbs.user_id, pbs.session_id, pcm.challenge_id
),
best_session_per_challenge AS (
    -- Find the best session for each challenge
    SELECT DISTINCT ON (user_id, challenge_id)
        user_id,
        challenge_id,
        session_id,
        session_score,
        problems_in_session
    FROM
        session_challenge_scores
    ORDER BY
        user_id, challenge_id, session_score DESC
)
SELECT
    u.id AS user_id,
    COALESCE(u.display_name, 'User ' || u.id) AS name,
    u.avatar_url AS avatar,
    c.id AS challenge_id,
    COALESCE(bs.session_score, 0) AS score,
    COALESCE(bs.problems_in_session, '[]'::jsonb) AS problem_scores
FROM
    users u
CROSS JOIN
    (SELECT DISTINCT id FROM nova_challenges) c
LEFT JOIN
    best_session_per_challenge bs ON u.id = bs.user_id AND c.id = bs.challenge_id
ORDER BY
    score DESC, name;





CREATE OR REPLACE VIEW nova_team_leaderboard AS
WITH user_best_problem_scores AS (
    -- For each user, find the best score for each problem across all sessions
    SELECT
        s.user_id,
        s.problem_id,
        MAX(s.total_score) AS best_score
    FROM
        nova_submissions_with_scores s
    GROUP BY
        s.user_id, s.problem_id
),
team_best_problem_scores AS (
    -- For each team, find the best score for each problem across all team members
    SELECT
        tm.team_id,
        ubps.problem_id,
        MAX(ubps.best_score) AS best_score
    FROM
        user_best_problem_scores ubps
    JOIN
        nova_team_members tm ON ubps.user_id = tm.user_id
    GROUP BY
        tm.team_id, ubps.problem_id
),
problem_challenge_map AS (
    -- Map each problem to its challenge
    SELECT
        p.id AS problem_id,
        p.challenge_id
    FROM
        nova_problems p
),
team_challenge_scores AS (
    -- Calculate total score for each challenge per team
    SELECT
        tbps.team_id,
        pcm.challenge_id,
        SUM(tbps.best_score) AS challenge_score
    FROM
        team_best_problem_scores tbps
    JOIN
        problem_challenge_map pcm ON tbps.problem_id = pcm.problem_id
    GROUP BY
        tbps.team_id, pcm.challenge_id
),
challenge_scores_json AS (
    -- Convert challenge scores to JSON for each team
    SELECT
        team_id,
        jsonb_object_agg(challenge_id, challenge_score) AS challenge_scores
    FROM
        team_challenge_scores
    GROUP BY
        team_id
),
team_total_scores AS (
    -- Calculate total score as sum of all challenge scores
    SELECT
        team_id,
        SUM(challenge_score) AS total_score
    FROM
        team_challenge_scores
    GROUP BY
        team_id
)
SELECT
    t.id AS team_id,
    t.name,
    COALESCE(tts.total_score, 0) AS score,
    COALESCE(csj.challenge_scores, '{}'::jsonb) AS challenge_scores
FROM
    nova_teams t
LEFT JOIN
    team_total_scores tts ON t.id = tts.team_id
LEFT JOIN
    challenge_scores_json csj ON t.id = csj.team_id
ORDER BY
    score DESC, name;





CREATE OR REPLACE VIEW nova_team_challenge_leaderboard AS
WITH user_best_problem_scores AS (
    -- For each user, find the best score for each problem across all sessions
    SELECT
        s.user_id,
        s.problem_id,
        MAX(s.total_score) AS best_score
    FROM
        nova_submissions_with_scores s
    GROUP BY
        s.user_id, s.problem_id
),
team_best_problem_scores AS (
    -- For each team, find the best score for each problem across all team members
    SELECT
        tm.team_id,
        ubps.problem_id,
        MAX(ubps.best_score) AS best_score
    FROM
        user_best_problem_scores ubps
    JOIN
        nova_team_members tm ON ubps.user_id = tm.user_id
    GROUP BY
        tm.team_id, ubps.problem_id
),
problem_challenge_map AS (
    -- Map each problem to its challenge and title
    SELECT
        p.id AS problem_id,
        p.challenge_id,
        p.title AS problem_title
    FROM
        nova_problems p
),
team_problem_scores AS (
    -- Join problem scores with their details
    SELECT
        tbps.team_id,
        pcm.challenge_id,
        tbps.problem_id,
        pcm.problem_title,
        tbps.best_score AS score
    FROM
        team_best_problem_scores tbps
    JOIN
        problem_challenge_map pcm ON tbps.problem_id = pcm.problem_id
),
problem_scores_json AS (
    -- Convert problem scores to JSON for each team and challenge
    SELECT
        team_id,
        challenge_id,
        jsonb_agg(
            jsonb_build_object(
                'id', problem_id,
                'title', problem_title,
                'score', score
            )
        ) AS problem_scores
    FROM
        team_problem_scores
    GROUP BY
        team_id, challenge_id
),
team_challenge_scores AS (
    -- Calculate total score for each challenge per team
    SELECT
        team_id,
        challenge_id,
        SUM(score) AS total_score
    FROM
        team_problem_scores
    GROUP BY
        team_id, challenge_id
)
SELECT
    t.id AS team_id,
    t.name,
    tcs.challenge_id,
    COALESCE(tcs.total_score, 0) AS score,
    COALESCE(psj.problem_scores, '[]'::jsonb) AS problem_scores
FROM
    nova_teams t
CROSS JOIN
    (SELECT DISTINCT id FROM nova_challenges) c
LEFT JOIN
    team_challenge_scores tcs ON t.id = tcs.team_id AND c.id = tcs.challenge_id
LEFT JOIN
    problem_scores_json psj ON t.id = psj.team_id AND c.id = psj.challenge_id
ORDER BY
    score DESC, name;