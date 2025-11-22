-- Create realtime_log_aggregations table for storing aggregated log metrics
-- This reduces database writes by buffering logs in memory and flushing aggregated data every 15 minutes

CREATE TABLE IF NOT EXISTS "public"."realtime_log_aggregations" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "ws_id" uuid NOT NULL,
    "user_id" uuid,
    "channel_id" text,
    "time_bucket" timestamptz NOT NULL,
    "kind" text NOT NULL,
    "total_count" integer NOT NULL DEFAULT 0,
    "error_count" integer NOT NULL DEFAULT 0,
    "sample_messages" text[] DEFAULT '{}',
    "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE "public"."realtime_log_aggregations" ENABLE ROW LEVEL SECURITY;

-- Indexes for efficient querying
CREATE UNIQUE INDEX realtime_log_aggregations_id_pkey
    ON public.realtime_log_aggregations using btree (id);

CREATE INDEX realtime_log_aggregations_time_bucket_idx
    ON public.realtime_log_aggregations using btree (time_bucket DESC);

-- Create unique constraint to prevent duplicate time buckets per user
CREATE UNIQUE INDEX realtime_log_aggregations_unique_bucket_idx
    ON public.realtime_log_aggregations (ws_id, user_id, channel_id, time_bucket, kind);

-- Primary key
ALTER TABLE "public"."realtime_log_aggregations"
    ADD CONSTRAINT "realtime_log_aggregations_id_pkey"
    PRIMARY KEY USING INDEX "realtime_log_aggregations_id_pkey";

-- Foreign key to workspaces
ALTER TABLE "public"."realtime_log_aggregations"
    ADD CONSTRAINT "realtime_log_aggregations_ws_id_fkey"
    FOREIGN KEY (ws_id) REFERENCES public.workspaces(id)
    ON UPDATE CASCADE ON DELETE SET NULL not valid;

ALTER TABLE "public"."realtime_log_aggregations" validate CONSTRAINT "realtime_log_aggregations_ws_id_fkey";

-- Foreign key to users
ALTER TABLE "public"."realtime_log_aggregations"
    ADD CONSTRAINT "realtime_log_aggregations_user_id_fkey"
    FOREIGN KEY (user_id) REFERENCES public.users(id)
    ON UPDATE CASCADE ON DELETE SET NULL not valid;

ALTER TABLE "public"."realtime_log_aggregations" validate CONSTRAINT "realtime_log_aggregations_user_id_fkey";

ALTER TABLE "public"."realtime_log_aggregations"
    ADD CONSTRAINT "realtime_log_aggregations_unique_bucket"
    UNIQUE USING INDEX "realtime_log_aggregations_unique_bucket_idx";

-- RLS Policy
CREATE POLICY "Tuturuuu employees can view aggregated logs"
ON "public"."realtime_log_aggregations"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
    is_org_member(auth.uid(), '00000000-0000-0000-0000-000000000000')
);