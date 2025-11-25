-- Add timezone and first_day_of_week preferences to workspaces table
ALTER TABLE "public"."workspaces"
  ADD COLUMN "timezone" text DEFAULT 'auto',
  ADD COLUMN "first_day_of_week" text DEFAULT 'auto' CHECK (first_day_of_week IN ('auto', 'sunday', 'monday', 'saturday'));

COMMENT ON COLUMN "public"."workspaces"."timezone" IS 'IANA timezone identifier (e.g., America/New_York) or "auto" for system detection';
COMMENT ON COLUMN "public"."workspaces"."first_day_of_week" IS 'First day of week: "auto" (locale-based), "sunday", "monday", or "saturday"';

-- Add timezone and first_day_of_week preferences to users table
ALTER TABLE "public"."users"
  ADD COLUMN "timezone" text DEFAULT 'auto',
  ADD COLUMN "first_day_of_week" text DEFAULT 'auto' CHECK (first_day_of_week IN ('auto', 'sunday', 'monday', 'saturday'));

COMMENT ON COLUMN "public"."users"."timezone" IS 'User timezone preference (IANA identifier or "auto"). Overrides workspace timezone for display.';
COMMENT ON COLUMN "public"."users"."first_day_of_week" IS 'User first day of week preference: "auto" (locale-based), "sunday", "monday", or "saturday". Overrides workspace setting.';
