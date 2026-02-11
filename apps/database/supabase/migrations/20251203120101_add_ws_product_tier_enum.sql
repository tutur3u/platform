-- Create workspace product tier enum
CREATE TYPE workspace_product_tier AS ENUM ('FREE', 'PLUS', 'PRO', 'ENTERPRISE');

-- Add nullable tier field to workspace_subscription_products
ALTER TABLE workspace_subscription_products
ADD COLUMN tier workspace_product_tier;
