-- Add time tracking settings table for user preferences

-- Time tracking settings per user/workspace
create table "public"."time_tracking_settings" (
    "id" uuid not null default gen_random_uuid(),
    "ws_id" uuid not null,
    "user_id" uuid not null,
    "default_category_id" uuid,
    "auto_start_break" boolean default false,
    "break_duration_minutes" integer default 15,
    "work_duration_minutes" integer default 25,
    "notifications_enabled" boolean default true,
    "reminder_interval_minutes" integer default 30,
    "time_format" text default '12h' check (time_format in ('12h', '24h')),
    "week_starts_on" text default 'monday' check (week_starts_on in ('monday', 'sunday')),
    "daily_goal_minutes" integer default 480,
    "weekly_goal_minutes" integer default 2400,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);

-- Enable RLS
alter table "public"."time_tracking_settings" enable row level security;

-- Primary key
CREATE UNIQUE INDEX time_tracking_settings_pkey ON public.time_tracking_settings USING btree (id);
alter table "public"."time_tracking_settings" add constraint "time_tracking_settings_pkey" PRIMARY KEY using index "time_tracking_settings_pkey";

-- Unique constraint to ensure one settings record per user per workspace
CREATE UNIQUE INDEX time_tracking_settings_user_ws_unique ON public.time_tracking_settings USING btree (ws_id, user_id);

-- Foreign key constraints
alter table "public"."time_tracking_settings" add constraint "time_tracking_settings_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE;
alter table "public"."time_tracking_settings" add constraint "time_tracking_settings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."time_tracking_settings" add constraint "time_tracking_settings_default_category_id_fkey" FOREIGN KEY (default_category_id) REFERENCES time_tracking_categories(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX time_tracking_settings_user_id_idx ON public.time_tracking_settings USING btree (user_id);
CREATE INDEX time_tracking_settings_ws_id_idx ON public.time_tracking_settings USING btree (ws_id);

-- RLS Policies
create policy "Allow users to read their own settings" on "public"."time_tracking_settings" as permissive for select to authenticated using (
    user_id = auth.uid() AND 
    EXISTS (
        SELECT 1 FROM workspace_members wu 
        WHERE wu.ws_id = time_tracking_settings.ws_id 
        AND wu.user_id = auth.uid()
    )
);

create policy "Allow users to manage their own settings" on "public"."time_tracking_settings" as permissive for all to authenticated using (
    user_id = auth.uid() AND 
    EXISTS (
        SELECT 1 FROM workspace_members wu 
        WHERE wu.ws_id = time_tracking_settings.ws_id 
        AND wu.user_id = auth.uid()
    )
) with check (
    user_id = auth.uid() AND 
    EXISTS (
        SELECT 1 FROM workspace_members wu 
        WHERE wu.ws_id = time_tracking_settings.ws_id 
        AND wu.user_id = auth.uid()
    )
);

-- Function to automatically update timestamp
CREATE OR REPLACE FUNCTION update_time_tracking_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update timestamp
CREATE TRIGGER update_time_tracking_settings_timestamp_trigger
    BEFORE UPDATE ON time_tracking_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_time_tracking_settings_timestamp();
