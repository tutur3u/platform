-- Migration: Add Scheduling Settings
-- Description: Adds energy_profile and scheduling_settings to workspaces

-- Add energy_profile and scheduling_settings to workspaces
ALTER TABLE "public"."workspaces" 
ADD COLUMN IF NOT EXISTS "energy_profile" text,
ADD COLUMN IF NOT EXISTS "scheduling_settings" jsonb DEFAULT '{"min_buffer": 5, "preferred_buffer": 15}'::jsonb;

COMMENT ON COLUMN "public"."workspaces"."energy_profile" IS 'User energy profile preference (e.g., morning_person, night_owl)';
COMMENT ON COLUMN "public"."workspaces"."scheduling_settings" IS 'JSONB object containing scheduling preferences like buffer times';