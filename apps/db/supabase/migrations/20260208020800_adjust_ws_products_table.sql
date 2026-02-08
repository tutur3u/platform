-- Add new values to workspace_pricing_model enum
ALTER TYPE workspace_pricing_model ADD VALUE IF NOT EXISTS 'custom';
ALTER TYPE workspace_pricing_model ADD VALUE IF NOT EXISTS 'free';
ALTER TYPE workspace_pricing_model ADD VALUE IF NOT EXISTS 'metered_unit';
