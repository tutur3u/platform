-- Add pricing_model enum to track legacy vs seat-based subscriptions
CREATE TYPE workspace_pricing_model AS ENUM ('fixed', 'seat_based');

-- Add columns to workspace_subscriptions
ALTER TABLE workspace_subscriptions
ADD COLUMN pricing_model workspace_pricing_model DEFAULT 'fixed',
ADD COLUMN seat_count integer DEFAULT 1,
ADD COLUMN price_per_seat integer;  -- in cents

-- Add columns to workspace_subscription_products  
ALTER TABLE workspace_subscription_products
ADD COLUMN pricing_model workspace_pricing_model DEFAULT 'fixed',
ADD COLUMN price_per_seat integer,  -- in cents
ADD COLUMN min_seats integer DEFAULT 1,
ADD COLUMN max_seats integer;  -- NULL = unlimited

-- Add index for efficient seat limit checks
CREATE INDEX idx_ws_subscriptions_seat_based 
ON workspace_subscriptions(ws_id, pricing_model) 
WHERE pricing_model = 'seat_based';