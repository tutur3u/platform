CREATE OR REPLACE FUNCTION public.check_email_blocked(p_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_email TEXT := lower(p_email); -- Normalize input email
    v_domain TEXT := split_part(v_email, '@', 2);
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.email_blacklist
        WHERE
            -- Case 1: Direct email match (e.g., 'bad-user@example.com')
            (entry_type = 'email' AND value = v_email)
            OR
            -- Case 2: Domain match (e.g., 'example.com')
            (entry_type = 'domain' AND value = v_domain)
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';


CREATE OR REPLACE FUNCTION public.get_email_block_statuses(p_emails TEXT[])
RETURNS SETOF public.email_block_status AS $$
WITH input_emails AS (
    -- Use GROUP BY to process each unique input email only once
    SELECT
        e.email_in AS original_email,
        lower(e.email_in) AS normalized_email,
        split_part(lower(e.email_in), '@', 2) AS normalized_domain
    FROM unnest(p_emails) AS e(email_in)
    GROUP BY e.email_in
),
matches AS (
    -- Find all matches (blocking reason is not returned to caller for security)
    SELECT
        i.original_email
    FROM input_emails AS i
    -- Use INNER JOIN to find only those that *are* blocked
    JOIN public.email_blacklist AS bl
        ON (bl.entry_type = 'email' AND bl.value = i.normalized_email)
        OR (bl.entry_type = 'domain' AND bl.value = i.normalized_domain)
    GROUP BY i.original_email
)
-- LEFT JOIN the full input list against the matches
-- This ensures we return a row for *every* input email
SELECT
    i.original_email AS email,
    (m.original_email IS NOT NULL) AS is_blocked,
    NULL::TEXT AS reason
FROM input_emails AS i
LEFT JOIN matches AS m ON i.original_email = m.original_email;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';