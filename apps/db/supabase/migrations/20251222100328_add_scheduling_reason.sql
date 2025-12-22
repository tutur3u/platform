-- Migration: Add Scheduling Reason
-- Description: Adds scheduling_reason column to task_calendar_events and habit_calendar_events

ALTER TABLE "public"."task_calendar_events" ADD COLUMN IF NOT EXISTS "scheduling_reason" text;
ALTER TABLE "public"."habit_calendar_events" ADD COLUMN IF NOT EXISTS "scheduling_reason" text;

COMMENT ON COLUMN "public"."task_calendar_events"."scheduling_reason" IS 'The reason why this instance was scheduled at this time (e.g., peak energy, priority)';
COMMENT ON COLUMN "public"."habit_calendar_events"."scheduling_reason" IS 'The reason why this instance was scheduled at this time';
