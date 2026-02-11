-- Drop existing foreign key constraints
ALTER TABLE "public"."time_tracking_sessions" DROP CONSTRAINT IF EXISTS "time_tracking_sessions_user_id_fkey";
ALTER TABLE "public"."time_tracking_goals" DROP CONSTRAINT IF EXISTS "time_tracking_goals_user_id_fkey";

-- Add new foreign key constraints with CASCADE delete
ALTER TABLE "public"."time_tracking_sessions" ADD CONSTRAINT "time_tracking_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE "public"."time_tracking_goals" ADD CONSTRAINT "time_tracking_goals_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;