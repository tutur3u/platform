-- Remove default value from min_seats column
ALTER TABLE workspace_subscription_products
ALTER COLUMN min_seats DROP DEFAULT;

ALTER TABLE workspace_subscriptions
ALTER COLUMN pricing_model SET NOT NULL;

ALTER TABLE workspace_subscription_products
ALTER COLUMN pricing_model SET NOT NULL;

ALTER TABLE workspace_subscription_products
ALTER COLUMN tier SET NOT NULL;
