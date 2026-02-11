ALTER TABLE workspace_subscriptions
DROP COLUMN IF EXISTS pricing_model;

ALTER TABLE workspace_subscriptions
DROP COLUMN IF EXISTS price_per_seat;