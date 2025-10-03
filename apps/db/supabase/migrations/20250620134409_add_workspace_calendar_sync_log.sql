-- Add workspace_calendar_sync_log table to track calendar sync operations

-- Create workspace_calendar_sync_log table
CREATE TABLE "public"."workspace_calendar_sync_log" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "ws_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "google_account_email" text,
    "sync_started_at" timestamp with time zone NOT NULL,
    "sync_ended_at" timestamp with time zone,
    "status" text NOT NULL,
    "error_message" text,
    "event_snapshot_before" jsonb NOT NULL,
    "upserted_events" jsonb,
    "deleted_events" jsonb,
    "triggered_by" text NOT NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE "public"."workspace_calendar_sync_log" ENABLE ROW LEVEL SECURITY;

-- Create primary key
CREATE UNIQUE INDEX workspace_calendar_sync_log_pkey ON public.workspace_calendar_sync_log USING btree (id);
ALTER TABLE "public"."workspace_calendar_sync_log" ADD CONSTRAINT "workspace_calendar_sync_log_pkey" PRIMARY KEY using index "workspace_calendar_sync_log_pkey";

-- Create indexes for better query performance
CREATE INDEX workspace_calendar_sync_log_workspace_id_idx ON public.workspace_calendar_sync_log USING btree (ws_id);
CREATE INDEX workspace_calendar_sync_log_status_idx ON public.workspace_calendar_sync_log USING btree (status);
CREATE INDEX workspace_calendar_sync_log_sync_started_at_idx ON public.workspace_calendar_sync_log USING btree (sync_started_at);

-- RLS Policies
-- Users can see sync logs for workspaces they are members of
CREATE POLICY "Users can view sync logs for their workspaces"
ON public.workspace_calendar_sync_log
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.ws_id = ws_id
        AND wm.user_id = auth.uid()
    )
);

-- Add check constraint for status values
ALTER TABLE "public"."workspace_calendar_sync_log" 
ADD CONSTRAINT "workspace_calendar_sync_log_status_check" 
CHECK (status IN ('success', 'failed', 'in_progress', 'cancelled', 'partial_success'));

-- Add check constraint for triggered_by values
ALTER TABLE "public"."workspace_calendar_sync_log" 
ADD CONSTRAINT "workspace_calendar_sync_log_triggered_by_check" 
CHECK (triggered_by IN ('active_sync', 'trigger_dot_dev', 'manual'));

-- Add check constraint to ensure sync_ended_at is after sync_started_at when both are present
ALTER TABLE "public"."workspace_calendar_sync_log" 
ADD CONSTRAINT "workspace_calendar_sync_log_timestamps_check" 
CHECK (sync_ended_at IS NULL OR sync_ended_at >= sync_started_at); 