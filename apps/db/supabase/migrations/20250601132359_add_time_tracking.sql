-- Time tracking tables for accurate task and project time management

-- Time tracking categories (e.g., Development, Meeting, Research, etc.)
create table "public"."time_tracking_categories" (
    "id" uuid not null default gen_random_uuid(),
    "ws_id" uuid not null,
    "name" text not null,
    "description" text,
    "color" text default 'BLUE',
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);

-- Time tracking sessions - individual time tracking entries
create table "public"."time_tracking_sessions" (
    "id" uuid not null default gen_random_uuid(),
    "ws_id" uuid not null,
    "user_id" uuid not null,
    "task_id" uuid,
    "category_id" uuid,
    "title" text not null,
    "description" text,
    "start_time" timestamp with time zone not null,
    "end_time" timestamp with time zone,
    "duration_seconds" integer, -- calculated duration for convenience
    "is_running" boolean default false,
    "tags" text[], -- array of tags for filtering
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);

-- Daily time goals per user/workspace
create table "public"."time_tracking_goals" (
    "id" uuid not null default gen_random_uuid(),
    "ws_id" uuid not null,
    "user_id" uuid not null,
    "category_id" uuid,
    "daily_goal_minutes" integer not null default 480, -- 8 hours default
    "weekly_goal_minutes" integer,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);

-- Enable RLS
alter table "public"."time_tracking_categories" enable row level security;
alter table "public"."time_tracking_sessions" enable row level security;
alter table "public"."time_tracking_goals" enable row level security;

-- Primary keys
CREATE UNIQUE INDEX time_tracking_categories_pkey ON public.time_tracking_categories USING btree (id);
CREATE UNIQUE INDEX time_tracking_sessions_pkey ON public.time_tracking_sessions USING btree (id);
CREATE UNIQUE INDEX time_tracking_goals_pkey ON public.time_tracking_goals USING btree (id);

alter table "public"."time_tracking_categories" add constraint "time_tracking_categories_pkey" PRIMARY KEY using index "time_tracking_categories_pkey";
alter table "public"."time_tracking_sessions" add constraint "time_tracking_sessions_pkey" PRIMARY KEY using index "time_tracking_sessions_pkey";
alter table "public"."time_tracking_goals" add constraint "time_tracking_goals_pkey" PRIMARY KEY using index "time_tracking_goals_pkey";

-- Foreign key constraints
alter table "public"."time_tracking_categories" add constraint "time_tracking_categories_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE;
alter table "public"."time_tracking_categories" add constraint "time_tracking_categories_color_fkey" FOREIGN KEY (color) REFERENCES calendar_event_colors(value) ON DELETE SET DEFAULT;

alter table "public"."time_tracking_sessions" add constraint "time_tracking_sessions_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE;
alter table "public"."time_tracking_sessions" add constraint "time_tracking_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."time_tracking_sessions" add constraint "time_tracking_sessions_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
alter table "public"."time_tracking_sessions" add constraint "time_tracking_sessions_category_id_fkey" FOREIGN KEY (category_id) REFERENCES time_tracking_categories(id) ON DELETE SET NULL;

alter table "public"."time_tracking_goals" add constraint "time_tracking_goals_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE;
alter table "public"."time_tracking_goals" add constraint "time_tracking_goals_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."time_tracking_goals" add constraint "time_tracking_goals_category_id_fkey" FOREIGN KEY (category_id) REFERENCES time_tracking_categories(id) ON DELETE CASCADE;

-- Indexes for performance
CREATE INDEX time_tracking_sessions_user_id_idx ON public.time_tracking_sessions USING btree (user_id);
CREATE INDEX time_tracking_sessions_ws_id_idx ON public.time_tracking_sessions USING btree (ws_id);
CREATE INDEX time_tracking_sessions_task_id_idx ON public.time_tracking_sessions USING btree (task_id);
CREATE INDEX time_tracking_sessions_start_time_idx ON public.time_tracking_sessions USING btree (start_time);
CREATE INDEX time_tracking_sessions_is_running_idx ON public.time_tracking_sessions USING btree (is_running);

-- Ensure only one running session per user per workspace
CREATE UNIQUE INDEX time_tracking_sessions_one_running_per_user ON public.time_tracking_sessions 
USING btree (ws_id, user_id) WHERE is_running = true;

-- RLS Policies
-- Categories
create policy "Allow workspace members to read categories" on "public"."time_tracking_categories" as permissive for select to authenticated using (
    EXISTS (
        SELECT 1 FROM workspace_members wu 
        WHERE wu.ws_id = time_tracking_categories.ws_id 
        AND wu.user_id = auth.uid()
    )
);

create policy "Allow workspace members to manage categories" on "public"."time_tracking_categories" as permissive for all to authenticated using (
    EXISTS (
        SELECT 1 FROM workspace_members wu 
        WHERE wu.ws_id = time_tracking_categories.ws_id 
        AND wu.user_id = auth.uid()
    )
) with check (
    EXISTS (
        SELECT 1 FROM workspace_members wu 
        WHERE wu.ws_id = time_tracking_categories.ws_id 
        AND wu.user_id = auth.uid()
    )
);

-- Sessions
create policy "Allow users to read their own sessions" on "public"."time_tracking_sessions" as permissive for select to authenticated using (
    user_id = auth.uid() AND 
    EXISTS (
        SELECT 1 FROM workspace_members wu 
        WHERE wu.ws_id = time_tracking_sessions.ws_id 
        AND wu.user_id = auth.uid()
    )
);

create policy "Allow users to manage their own sessions" on "public"."time_tracking_sessions" as permissive for all to authenticated using (
    user_id = auth.uid() AND 
    EXISTS (
        SELECT 1 FROM workspace_members wu 
        WHERE wu.ws_id = time_tracking_sessions.ws_id 
        AND wu.user_id = auth.uid()
    )
) with check (
    user_id = auth.uid() AND 
    EXISTS (
        SELECT 1 FROM workspace_members wu 
        WHERE wu.ws_id = time_tracking_sessions.ws_id 
        AND wu.user_id = auth.uid()
    )
);

-- Goals
create policy "Allow users to read their own goals" on "public"."time_tracking_goals" as permissive for select to authenticated using (
    user_id = auth.uid() AND 
    EXISTS (
        SELECT 1 FROM workspace_members wu 
        WHERE wu.ws_id = time_tracking_goals.ws_id 
        AND wu.user_id = auth.uid()
    )
);

create policy "Allow users to manage their own goals" on "public"."time_tracking_goals" as permissive for all to authenticated using (
    user_id = auth.uid() AND 
    EXISTS (
        SELECT 1 FROM workspace_members wu 
        WHERE wu.ws_id = time_tracking_goals.ws_id 
        AND wu.user_id = auth.uid()
    )
) with check (
    user_id = auth.uid() AND 
    EXISTS (
        SELECT 1 FROM workspace_members wu 
        WHERE wu.ws_id = time_tracking_goals.ws_id 
        AND wu.user_id = auth.uid()
    )
);

-- Function to automatically update duration when session ends
CREATE OR REPLACE FUNCTION update_session_duration()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate duration if end_time is set and start_time exists
    IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
        NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time))::integer;
        NEW.is_running = false;
    ELSIF NEW.end_time IS NULL AND OLD.end_time IS NOT NULL THEN
        -- If end_time is being cleared, clear duration and set running
        NEW.duration_seconds = NULL;
        NEW.is_running = true;
    END IF;
    
    -- Update timestamp
    NEW.updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update duration
CREATE TRIGGER update_session_duration_trigger
    BEFORE UPDATE ON time_tracking_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_session_duration();

-- Function to stop all running sessions for a user when starting a new one
CREATE OR REPLACE FUNCTION stop_other_running_sessions()
RETURNS TRIGGER AS $$
BEGIN
    -- If this session is being set to running, stop all other running sessions for this user in this workspace
    IF NEW.is_running = true THEN
        UPDATE time_tracking_sessions 
        SET 
            is_running = false,
            end_time = COALESCE(end_time, NOW()),
            updated_at = NOW()
        WHERE 
            ws_id = NEW.ws_id 
            AND user_id = NEW.user_id 
            AND id != NEW.id 
            AND is_running = true;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to stop other running sessions
CREATE TRIGGER stop_other_running_sessions_trigger
    AFTER INSERT OR UPDATE ON time_tracking_sessions
    FOR EACH ROW
    EXECUTE FUNCTION stop_other_running_sessions();

-- Insert default categories for workspaces
INSERT INTO time_tracking_categories (ws_id, name, description, color)
SELECT DISTINCT ws.id, 'Development', 'Software development and coding tasks', 'BLUE'
FROM workspaces ws
WHERE NOT EXISTS (
    SELECT 1 FROM time_tracking_categories ttc 
    WHERE ttc.ws_id = ws.id AND ttc.name = 'Development'
);

INSERT INTO time_tracking_categories (ws_id, name, description, color)
SELECT DISTINCT ws.id, 'Meetings', 'Team meetings and calls', 'GREEN'
FROM workspaces ws
WHERE NOT EXISTS (
    SELECT 1 FROM time_tracking_categories ttc 
    WHERE ttc.ws_id = ws.id AND ttc.name = 'Meetings'
);

INSERT INTO time_tracking_categories (ws_id, name, description, color)
SELECT DISTINCT ws.id, 'Research', 'Research and learning activities', 'PURPLE'
FROM workspaces ws
WHERE NOT EXISTS (
    SELECT 1 FROM time_tracking_categories ttc 
    WHERE ttc.ws_id = ws.id AND ttc.name = 'Research'
);

INSERT INTO time_tracking_categories (ws_id, name, description, color)
SELECT DISTINCT ws.id, 'Planning', 'Project planning and organization', 'ORANGE'
FROM workspaces ws
WHERE NOT EXISTS (
    SELECT 1 FROM time_tracking_categories ttc 
    WHERE ttc.ws_id = ws.id AND ttc.name = 'Planning'
);
