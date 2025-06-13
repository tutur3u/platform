drop view if exists public.meet_together_users;
-- create public.meet_together_users view that gets public.meet_together_guests.name (via meet_together_guest_timeblocks.user_id) and public.users.display_name (via public.meet_together_user_timeblocks.user_id) as display_name,
-- and plan_id from either public.meet_together_guest_timeblocks or public.meet_together_user_timeblocks (join all by the plan_id)
CREATE OR REPLACE VIEW public.meet_together_users AS
SELECT DISTINCT ON (
        all_users.id,
        COALESCE(gtbs.plan_id, utbs.plan_id)
    ) all_users.id AS user_id,
    all_users.name AS display_name,
    COALESCE(gtbs.plan_id, utbs.plan_id) AS plan_id,
    CASE
        WHEN all_users.is_guest THEN TRUE
        ELSE FALSE
    END AS is_guest,
    -- number of timeblocks for the user/guest
    COUNT(COALESCE(gtbs.id, utbs.id)) AS timeblock_count
FROM (
        SELECT id,
            name,
            TRUE as is_guest
        FROM public.meet_together_guests
        UNION ALL
        SELECT id,
            display_name AS name,
            FALSE as is_guest
        FROM public.users
    ) AS all_users
    LEFT JOIN public.meet_together_guest_timeblocks AS gtbs ON all_users.id = gtbs.user_id
    AND all_users.is_guest
    LEFT JOIN public.meet_together_user_timeblocks AS utbs ON all_users.id = utbs.user_id
    AND NOT all_users.is_guest
    LEFT JOIN public.meet_together_plans AS plans ON plans.id = COALESCE(gtbs.plan_id, utbs.plan_id)
WHERE COALESCE(gtbs.plan_id, utbs.plan_id) IS NOT NULL
GROUP BY all_users.id,
    all_users.name,
    all_users.is_guest,
    gtbs.plan_id,
    utbs.plan_id;