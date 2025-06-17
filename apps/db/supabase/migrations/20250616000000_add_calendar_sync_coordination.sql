-- Create table to coordinate calendar sync operations
create table "public"."workspace_calendar_sync_coordination" (
    "ws_id" uuid not null,
    "last_upsert" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);

-- Add primary key
alter table "public"."workspace_calendar_sync_coordination" 
add constraint "workspace_calendar_sync_coordination_pkey" PRIMARY KEY (ws_id);

-- Add foreign key to workspaces
alter table "public"."workspace_calendar_sync_coordination" 
add constraint "workspace_calendar_sync_coordination_ws_id_fkey" 
FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE;

-- Enable RLS
alter table "public"."workspace_calendar_sync_coordination" enable row level security;

-- Create policy for workspace members
create policy "Enable access for workspace members" on "public"."workspace_calendar_sync_coordination" 
as permissive for all to authenticated using (
    EXISTS (
        SELECT 1 FROM workspace_members 
        WHERE workspace_members.ws_id = workspace_calendar_sync_coordination.ws_id
        AND workspace_members.user_id = auth.uid()
    )
) with check (
    EXISTS (
        SELECT 1 FROM workspace_members 
        WHERE workspace_members.ws_id = workspace_calendar_sync_coordination.ws_id
        AND workspace_members.user_id = auth.uid()
    )
);

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_workspace_calendar_sync_coordination_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_workspace_calendar_sync_coordination_updated_at
    BEFORE UPDATE ON workspace_calendar_sync_coordination
    FOR EACH ROW
    EXECUTE FUNCTION update_workspace_calendar_sync_coordination_updated_at();

-- Enable audit tracking
select audit.enable_tracking('public.workspace_calendar_sync_coordination'::regclass);