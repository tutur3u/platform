-- Add notes and task projects schema for bucket dump feature
-- This migration creates the necessary tables for the bucket dump functionality

-- Create notes table for storing quick notes that can be converted to tasks or projects
CREATE TABLE "public"."notes" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "content" text NOT NULL,
    "ws_id" uuid NOT NULL,
    "creator_id" uuid NOT NULL DEFAULT auth.uid(),
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "archived" boolean DEFAULT false,
    "deleted" boolean DEFAULT false
);

-- Enable RLS on notes table
ALTER TABLE "public"."notes" ENABLE ROW LEVEL SECURITY;

-- Create task_projects table for cross-board project coordination
CREATE TABLE "public"."task_projects" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "ws_id" uuid NOT NULL,
    "creator_id" uuid NOT NULL DEFAULT auth.uid(),
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "archived" boolean DEFAULT false,
    "deleted" boolean DEFAULT false,
    "status" text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'cancelled'))
);

-- Enable RLS on task_projects table
ALTER TABLE "public"."task_projects" ENABLE ROW LEVEL SECURITY;

-- Create task_initiatives table for grouping multiple projects
CREATE TABLE "public"."task_initiatives" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "ws_id" uuid NOT NULL,
    "creator_id" uuid NOT NULL DEFAULT auth.uid(),
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "archived" boolean DEFAULT false,
    "deleted" boolean DEFAULT false,
    "status" text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'cancelled'))
);

-- Enable RLS on task_initiatives table
ALTER TABLE "public"."task_initiatives" ENABLE ROW LEVEL SECURITY;

-- Create junction table for projects and initiatives
CREATE TABLE "public"."task_project_initiatives" (
    "project_id" uuid NOT NULL,
    "initiative_id" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

-- Enable RLS on junction table
ALTER TABLE "public"."task_project_initiatives" ENABLE ROW LEVEL SECURITY;

-- Create junction table for tasks and projects (cross-board coordination)
CREATE TABLE "public"."task_project_tasks" (
    "task_id" uuid NOT NULL,
    "project_id" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

-- Enable RLS on junction table
ALTER TABLE "public"."task_project_tasks" ENABLE ROW LEVEL SECURITY;

-- Add primary keys
ALTER TABLE "public"."notes" ADD CONSTRAINT "notes_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."task_projects" ADD CONSTRAINT "task_projects_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."task_initiatives" ADD CONSTRAINT "task_initiatives_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."task_project_initiatives" ADD CONSTRAINT "task_project_initiatives_pkey" PRIMARY KEY ("project_id", "initiative_id");
ALTER TABLE "public"."task_project_tasks" ADD CONSTRAINT "task_project_tasks_pkey" PRIMARY KEY ("task_id", "project_id");

-- Add foreign key constraints
ALTER TABLE "public"."notes" 
    ADD CONSTRAINT "notes_ws_id_fkey" FOREIGN KEY ("ws_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "notes_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE "public"."task_projects" 
    ADD CONSTRAINT "task_projects_ws_id_fkey" FOREIGN KEY ("ws_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "task_projects_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE "public"."task_initiatives" 
    ADD CONSTRAINT "task_initiatives_ws_id_fkey" FOREIGN KEY ("ws_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "task_initiatives_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE "public"."task_project_initiatives" 
    ADD CONSTRAINT "task_project_initiatives_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."task_projects"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "task_project_initiatives_initiative_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "public"."task_initiatives"("id") ON DELETE CASCADE;

ALTER TABLE "public"."task_project_tasks" 
    ADD CONSTRAINT "task_project_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "task_project_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."task_projects"("id") ON DELETE CASCADE;

-- Create indexes for better performance
CREATE INDEX "idx_notes_ws_id" ON "public"."notes"("ws_id");
CREATE INDEX "idx_notes_creator_id" ON "public"."notes"("creator_id");
CREATE INDEX "idx_notes_created_at" ON "public"."notes"("created_at");

CREATE INDEX "idx_task_projects_ws_id" ON "public"."task_projects"("ws_id");
CREATE INDEX "idx_task_projects_creator_id" ON "public"."task_projects"("creator_id");
CREATE INDEX "idx_task_projects_status" ON "public"."task_projects"("status");

CREATE INDEX "idx_task_initiatives_ws_id" ON "public"."task_initiatives"("ws_id");
CREATE INDEX "idx_task_initiatives_creator_id" ON "public"."task_initiatives"("creator_id");
CREATE INDEX "idx_task_initiatives_status" ON "public"."task_initiatives"("status");

-- Create RLS policies for notes
CREATE POLICY "Users can view notes in their workspaces" ON "public"."notes"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm 
            WHERE wm.ws_id = notes.ws_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create notes in their workspaces" ON "public"."notes"
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm 
            WHERE wm.ws_id = notes.ws_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own notes" ON "public"."notes"
    FOR UPDATE USING (creator_id = auth.uid());

CREATE POLICY "Users can delete their own notes" ON "public"."notes"
    FOR DELETE USING (creator_id = auth.uid());

-- Create RLS policies for task_projects
CREATE POLICY "Users can view task projects in their workspaces" ON "public"."task_projects"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm 
            WHERE wm.ws_id = task_projects.ws_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create task projects in their workspaces" ON "public"."task_projects"
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm 
            WHERE wm.ws_id = task_projects.ws_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update task projects in their workspaces" ON "public"."task_projects"
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm 
            WHERE wm.ws_id = task_projects.ws_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete task projects in their workspaces" ON "public"."task_projects"
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm 
            WHERE wm.ws_id = task_projects.ws_id AND wm.user_id = auth.uid()
        )
    );

-- Create RLS policies for task_initiatives
CREATE POLICY "Users can view task initiatives in their workspaces" ON "public"."task_initiatives"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm 
            WHERE wm.ws_id = task_initiatives.ws_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create task initiatives in their workspaces" ON "public"."task_initiatives"
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm 
            WHERE wm.ws_id = task_initiatives.ws_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update task initiatives in their workspaces" ON "public"."task_initiatives"
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm 
            WHERE wm.ws_id = task_initiatives.ws_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete task initiatives in their workspaces" ON "public"."task_initiatives"
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm 
            WHERE wm.ws_id = task_initiatives.ws_id AND wm.user_id = auth.uid()
        )
    );

-- Create RLS policies for junction tables
CREATE POLICY "Users can view task project initiatives in their workspaces" ON "public"."task_project_initiatives"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."task_projects" tp
            JOIN "public"."workspace_members" wm ON wm.ws_id = tp.ws_id
            WHERE tp.id = task_project_initiatives.project_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage task project initiatives in their workspaces" ON "public"."task_project_initiatives"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."task_projects" tp
            JOIN "public"."workspace_members" wm ON wm.ws_id = tp.ws_id
            WHERE tp.id = task_project_initiatives.project_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view task project tasks in their workspaces" ON "public"."task_project_tasks"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."task_projects" tp
            JOIN "public"."workspace_members" wm ON wm.ws_id = tp.ws_id
            WHERE tp.id = task_project_tasks.project_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage task project tasks in their workspaces" ON "public"."task_project_tasks"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."task_projects" tp
            JOIN "public"."workspace_members" wm ON wm.ws_id = tp.ws_id
            WHERE tp.id = task_project_tasks.project_id AND wm.user_id = auth.uid()
        )
    );

-- Grant necessary permissions
GRANT ALL ON "public"."notes" TO "authenticated";
GRANT ALL ON "public"."task_projects" TO "authenticated";
GRANT ALL ON "public"."task_initiatives" TO "authenticated";
GRANT ALL ON "public"."task_project_initiatives" TO "authenticated";
GRANT ALL ON "public"."task_project_tasks" TO "authenticated";
