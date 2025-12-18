-- Migration: Fix Break Duration Match Constraint
-- Description: Updates the duration_match constraint in time_tracking_breaks to use integer comparison,
--              preventing failures due to fractional seconds in timestamp differences.
-- Date: 2024-12-18

-- Drop the problematic constraint
alter table "public"."time_tracking_breaks" 
  drop constraint if exists "time_tracking_breaks_duration_match";

-- Re-add the constraint with proper integer casting to match the trigger's logic
alter table "public"."time_tracking_breaks"
  add constraint "time_tracking_breaks_duration_match" check (
    "break_duration_seconds" is null 
    or "break_end" is null 
    or "break_duration_seconds" = extract(epoch from ("break_end" - "break_start"))::integer
  );

-- Add comment explaining the fix
comment on constraint "time_tracking_breaks_duration_match" on "public"."time_tracking_breaks" is 
  'Ensures break_duration_seconds matches the integer part of the calculated duration between timestamps.';
