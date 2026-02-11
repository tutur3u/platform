-- Optimize Posts page performance by adding critical missing indexes
-- These indexes significantly improve query performance for the /[wsId]/posts page

-- Index on user_group_post_checks.created_at for ORDER BY clause
-- This eliminates the need for a full table scan and sort operation
CREATE INDEX IF NOT EXISTS user_group_post_checks_created_at_idx
  ON "public"."user_group_post_checks" ("created_at" DESC);

-- Index on user_group_post_checks.user_id for faster user filtering
-- While user_id is in composite PK (post_id, user_id), queries filtering only by user_id
-- cannot efficiently use the composite index
CREATE INDEX IF NOT EXISTS user_group_post_checks_user_id_idx
  ON "public"."user_group_post_checks" ("user_id");

-- Index on user_group_posts.group_id for filtering by included/excluded groups
-- This is critical for the group-based filters in the Posts page
CREATE INDEX IF NOT EXISTS user_group_posts_group_id_idx
  ON "public"."user_group_posts" ("group_id");

-- Index on sent_emails.post_id for faster joins with user_group_posts
-- The Posts page joins sent_emails to get email status information
CREATE INDEX IF NOT EXISTS sent_emails_post_id_idx
  ON "public"."sent_emails" ("post_id");

-- Index on sent_emails.receiver_id for faster joins with workspace_users
-- Used in the getSentEmails query
CREATE INDEX IF NOT EXISTS sent_emails_receiver_id_idx
  ON "public"."sent_emails" ("receiver_id");

-- Composite index for optimal query performance combining user_id and created_at
-- This supports both filtering by user and ordering by created_at in a single index
CREATE INDEX IF NOT EXISTS user_group_post_checks_user_id_created_at_idx
  ON "public"."user_group_post_checks" ("user_id", "created_at" DESC);

-- Note: The ILIKE '%@easy%' filter on workspace_users.email cannot use an index
-- due to the leading wildcard. Consider alternatives:
-- 1. Add a boolean column 'is_internal' with a functional index
-- 2. Filter in application code if the dataset is small
-- 3. Use a materialized view for frequently accessed queries
