
-- Create the enum type for referral reward options
CREATE TYPE public.referral_reward_type AS ENUM ('REFERRER', 'RECEIVER', 'BOTH');

-- Add the column to workspace_settings with a default of 'REFERRER' (matching current behavior)
ALTER TABLE public.workspace_settings
ADD COLUMN referral_reward_type public.referral_reward_type NOT NULL DEFAULT 'REFERRER';

-- Update the view to respect the referral_reward_type for the referrer's discount
CREATE OR REPLACE VIEW public.v_user_referral_discounts AS
WITH referral_counts AS (
    SELECT workspace_users.referred_by AS user_id,
    count(*) AS active_referral_count
    FROM workspace_users
    WHERE ((workspace_users.referred_by IS NOT NULL) AND (workspace_users.archived = false))
    GROUP BY workspace_users.referred_by
)
SELECT p.id AS promo_id,
    p.owner_id AS user_id,
    p.code AS promo_code,
    CASE
        WHEN s.referral_reward_type = 'RECEIVER' THEN 0
        ELSE (LEAST(COALESCE(rc.active_referral_count, (0)::bigint), (s.referral_count_cap)::bigint) * s.referral_increment_percent)
    END AS calculated_discount_value,
    p.ws_id
FROM ((workspace_promotions p
    LEFT JOIN referral_counts rc ON ((p.owner_id = rc.user_id)))
    JOIN workspace_settings s ON ((p.ws_id = s.ws_id)))
WHERE (p.promo_type = 'REFERRAL'::promotion_type);
