CREATE OR REPLACE FUNCTION get_monthly_income_expense(_ws_id UUID, past_months INT DEFAULT 12)
RETURNS TABLE(month DATE, total_income NUMERIC, total_expense NUMERIC) AS $$
BEGIN
    RETURN QUERY
    WITH month_series AS (
        SELECT generate_series(
            date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' * (past_months - 1), 
            date_trunc('month', CURRENT_DATE), 
            '1 month'::interval
        )::DATE AS month
    ),
    monthly_transactions AS (
        SELECT
            date_trunc('month', wt.taken_at::timestamp)::DATE AS month,
            SUM(CASE WHEN wt.amount > 0 THEN wt.amount ELSE 0 END)::NUMERIC AS income,
            SUM(CASE WHEN wt.amount < 0 THEN wt.amount ELSE 0 END)::NUMERIC AS expense
        FROM
            wallet_transactions wt
            INNER JOIN workspace_wallets ww ON wt.wallet_id = ww.id
        WHERE
            wt.taken_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' * (past_months - 1)
            AND wt.taken_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
            AND ww.ws_id = _ws_id
        GROUP BY
            date_trunc('month', wt.taken_at::timestamp)::DATE
    )
    SELECT
        ms.month,
        COALESCE(mt.income, 0)::NUMERIC AS total_income,
        ABS(COALESCE(mt.expense, 0))::NUMERIC AS total_expense
    FROM
        month_series ms
        LEFT JOIN monthly_transactions mt ON ms.month = mt.month
    ORDER BY
        ms.month;
END; $$
LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_daily_income_expense(_ws_id UUID, past_days INT DEFAULT 14)
RETURNS TABLE(day DATE, total_income NUMERIC, total_expense NUMERIC) AS $$
BEGIN
    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(CURRENT_DATE - (past_days - 1), CURRENT_DATE, '1 day'::interval)::DATE AS day
    ),
    daily_transactions AS (
        SELECT
            date_trunc('day', wt.taken_at::timestamp)::DATE AS day,
            SUM(CASE WHEN wt.amount > 0 THEN wt.amount ELSE 0 END)::NUMERIC AS income,
            SUM(CASE WHEN wt.amount < 0 THEN wt.amount ELSE 0 END)::NUMERIC AS expense
        FROM
            wallet_transactions wt
            INNER JOIN workspace_wallets ww ON wt.wallet_id = ww.id
        WHERE
            wt.taken_at::date >= CURRENT_DATE - (past_days - 1)
            AND ww.ws_id = _ws_id
        GROUP BY
            date_trunc('day', wt.taken_at::timestamp)::DATE
    )
    SELECT
        ds.day,
        COALESCE(dt.income, 0)::NUMERIC AS total_income,
        ABS(COALESCE(dt.expense, 0))::NUMERIC AS total_expense
    FROM
        date_series ds
        LEFT JOIN daily_transactions dt ON ds.day = dt.day
    ORDER BY
        ds.day;
END; $$
LANGUAGE plpgsql;

CREATE OR REPLACE VIEW public.audit_logs WITH (security_invoker=on) AS
SELECT audit_log.id,
    audit_log.table_name,
    audit_log.record_id,
    audit_log.old_record_id,
    audit_log.op,
    audit_log.ts,
    audit_log.record,
    audit_log.old_record,
    audit_log.auth_role,
    audit_log.auth_uid,
    coalesce(
        audit.get_ws_id(audit_log.table_name, audit_log.record),
        audit.get_ws_id(audit_log.table_name, audit_log.old_record)
    ) AS ws_id
FROM audit.record_version AS audit_log
WHERE EXISTS (
        SELECT 1
        FROM workspace_members wm
        WHERE (
                wm.ws_id = audit.get_ws_id(audit_log.table_name, audit_log.record)
                OR wm.ws_id = audit.get_ws_id(audit_log.table_name, audit_log.old_record)
            )
            AND (
                auth.uid() IS NULL
                OR wm.user_id = auth.uid()
            )
    )
ORDER BY audit_log.ts DESC;

create or replace view "public"."calendar_event_participants" WITH (security_invoker=on) as
SELECT p.event_id,
    p.user_id AS participant_id,
    p.going,
    u.display_name,
    u.handle,
    'platform_user'::text AS type,
    p.created_at
FROM (
        calendar_event_platform_participants p
        JOIN users u ON ((u.id = p.user_id))
    )
UNION
SELECT p.event_id,
    p.user_id AS participant_id,
    p.going,
    u.display_name,
    COALESCE(u.phone, u.email) AS handle,
    'virtual_user'::text AS type,
    p.created_at
FROM (
        calendar_event_virtual_participants p
        JOIN workspace_users u ON ((u.id = p.user_id))
    )
UNION
SELECT p.event_id,
    p.group_id AS participant_id,
    NULL::boolean AS going,
    g.name AS display_name,
    NULL::text AS handle,
    'user_group'::text AS type,
    p.created_at
FROM (
        calendar_event_participant_groups p
        JOIN workspace_user_groups g ON ((g.id = p.group_id))
    );

create or replace view "public"."distinct_invoice_creators" WITH (security_invoker=on) as SELECT DISTINCT u.id,
    COALESCE(u.display_name, u.full_name) AS display_name
   FROM finance_invoices b,
    workspace_users u
  WHERE (u.id = b.creator_id);

CREATE OR REPLACE VIEW public.meet_together_users WITH (security_invoker=on) AS
SELECT DISTINCT ON (
        all_users.id,
        COALESCE(gtbs.plan_id, utbs.plan_id)
    ) all_users.id AS user_id,
    COALESCE(NULLIF(all_users.name, ''), upd.email) AS display_name,
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
        SELECT u.id,
            u.display_name AS name,
            FALSE as is_guest
        FROM public.users u
    ) AS all_users
    LEFT JOIN public.user_private_details upd ON all_users.id = upd.user_id
    LEFT JOIN public.meet_together_guest_timeblocks AS gtbs ON all_users.id = gtbs.user_id
    AND all_users.is_guest
    LEFT JOIN public.meet_together_user_timeblocks AS utbs ON all_users.id = utbs.user_id
    AND NOT all_users.is_guest
    LEFT JOIN public.meet_together_plans AS plans ON plans.id = COALESCE(gtbs.plan_id, utbs.plan_id)
WHERE COALESCE(gtbs.plan_id, utbs.plan_id) IS NOT NULL
GROUP BY all_users.id,
    all_users.name,
    upd.email,
    all_users.is_guest,
    gtbs.plan_id,
    utbs.plan_id;

create or replace view "public"."workspace_members_and_invites" WITH (security_invoker=on) as SELECT wi.ws_id,
    u.id,
    u.handle,
    NULL::text AS email,
    u.display_name,
    u.avatar_url,
    COALESCE(wm.role, wi.role) AS role,
    COALESCE(wm.role_title, wi.role_title) AS role_title,
    COALESCE(wm.created_at, wi.created_at) AS created_at,
    (wm.user_id IS NULL) AS pending
   FROM ((workspace_invites wi
     LEFT JOIN workspace_members wm ON (((wi.user_id = wm.user_id) AND (wi.ws_id = wm.ws_id))))
     JOIN users u ON ((wi.user_id = u.id)))
UNION
 SELECT wm.ws_id,
    wm.user_id AS id,
    u.handle,
    upd.email,
    u.display_name,
    u.avatar_url,
    wm.role,
    wm.role_title,
    wm.created_at,
    false AS pending
   FROM ((workspace_members wm
     JOIN users u ON ((wm.user_id = u.id)))
     JOIN user_private_details upd ON ((upd.user_id = u.id)))
UNION
 SELECT wei.ws_id,
    NULL::uuid AS id,
    NULL::text AS handle,
    wei.email,
    NULL::text AS display_name,
    NULL::text AS avatar_url,
    wei.role,
    wei.role_title,
    wei.created_at,
    true AS pending
   FROM workspace_email_invites wei;

drop view if exists public.workspace_user_groups_with_amount;
CREATE OR REPLACE VIEW workspace_user_groups_with_amount WITH (security_invoker=on) AS
SELECT workspace_user_groups.*,
    count(workspace_user_groups_users.*) AS amount
FROM workspace_user_groups
    LEFT JOIN workspace_user_groups_users ON workspace_user_groups_users.group_id = workspace_user_groups.id
GROUP BY workspace_user_groups.id;

CREATE OR REPLACE VIEW workspace_users_with_groups WITH (security_invoker=on) AS
SELECT
    wu.*,
    (SELECT json_agg(wug.id)
     FROM workspace_user_groups wug
     JOIN workspace_user_groups_users wugu
     ON wug.id = wugu.group_id
     WHERE wugu.user_id = wu.id) AS groups,
    (SELECT COUNT(*)
     FROM workspace_user_groups wug
     JOIN workspace_user_groups_users wugu
     ON wug.id = wugu.group_id
     WHERE wugu.user_id = wu.id) AS group_count,
    (SELECT json_agg(linked_users) FROM (
        SELECT DISTINCT ON (wulu.platform_user_id)
            wulu.platform_user_id,
            u.display_name
        FROM workspace_user_linked_users wulu
        JOIN users u ON wulu.platform_user_id = u.id
        JOIN workspace_members wm ON u.id = wm.user_id
        WHERE wm.user_id = u.id AND wulu.virtual_user_id = wu.id
    ) AS linked_users) AS linked_users
FROM workspace_users wu;