-- Create realtime_log_aggregations table for storing aggregated log metrics
-- This reduces database writes by buffering logs in memory and flushing aggregated data every 15 minutes

CREATE TABLE IF NOT EXISTS "public"."realtime_log_aggregations" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "ws_id" uuid NOT NULL,
    "user_id" uuid,
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
    ON public.realtime_log_aggregations (ws_id, user_id, time_bucket, kind);

ALTER TABLE "public"."realtime_log_aggregations"
    ADD CONSTRAINT "realtime_log_aggregations_unique_bucket"
    UNIQUE USING INDEX "realtime_log_aggregations_unique_bucket_idx";

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

-- RLS Policy: Users can view aggregated logs for their workspaces
CREATE POLICY "Users can view aggregated logs for their workspaces"
ON "public"."realtime_log_aggregations"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
    (EXISTS (
        SELECT 1
        FROM public.workspace_members
        WHERE ws_id = realtime_log_aggregations.ws_id
        AND user_id = auth.uid()
    )) OR
    (EXISTS (
        SELECT 1
        FROM public.workspace_role_members wrm
        JOIN public.workspace_roles wr ON wrm.role_id = wr.id
        WHERE wr.ws_id = realtime_log_aggregations.ws_id
        AND wrm.user_id = auth.uid()
        AND wr.name IN ('OWNER', 'ADMIN')
    ))
);

-- Function to cleanup old aggregated logs (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_log_aggregations()
RETURNS void AS $$
BEGIN
    DELETE FROM public.realtime_log_aggregations
    WHERE time_bucket < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
