-- Add task cycles (sprints) schema
-- reversible: to rollback, DROP in reverse order of FKs after confirming no dependent code

-- Create task_cycles table
CREATE TABLE "public"."task_cycles" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "ws_id" uuid NOT NULL,
    "creator_id" uuid NOT NULL DEFAULT auth.uid(),
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "archived" boolean DEFAULT false,
    "deleted" boolean DEFAULT false,
    "status" text DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
    "start_date" date,
    "end_date" date
);

ALTER TABLE "public"."task_cycles" ENABLE ROW LEVEL SECURITY;

-- Junction: tasks assigned to cycles
CREATE TABLE "public"."task_cycle_tasks" (
    "task_id" uuid NOT NULL,
    "cycle_id" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "public"."task_cycle_tasks" ENABLE ROW LEVEL SECURITY;

-- Primary keys
ALTER TABLE "public"."task_cycles" ADD CONSTRAINT "task_cycles_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."task_cycle_tasks" ADD CONSTRAINT "task_cycle_tasks_pkey" PRIMARY KEY ("task_id", "cycle_id");

-- Foreign keys
ALTER TABLE "public"."task_cycles"
    ADD CONSTRAINT "task_cycles_ws_id_fkey" FOREIGN KEY ("ws_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "task_cycles_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE "public"."task_cycle_tasks"
    ADD CONSTRAINT "task_cycle_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "task_cycle_tasks_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."task_cycles"("id") ON DELETE CASCADE;

-- Indexes
CREATE INDEX "idx_task_cycles_ws_id" ON "public"."task_cycles"("ws_id");
CREATE INDEX "idx_task_cycles_creator_id" ON "public"."task_cycles"("creator_id");
CREATE INDEX "idx_task_cycles_status" ON "public"."task_cycles"("status");
CREATE INDEX "idx_task_cycles_start_date" ON "public"."task_cycles"("start_date");
CREATE INDEX "idx_task_cycles_end_date" ON "public"."task_cycles"("end_date");

-- RLS policies for task_cycles
CREATE POLICY "Users can view task cycles in their workspaces" ON "public"."task_cycles"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm
            WHERE wm.ws_id = task_cycles.ws_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create task cycles in their workspaces" ON "public"."task_cycles"
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm
            WHERE wm.ws_id = task_cycles.ws_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update task cycles in their workspaces" ON "public"."task_cycles"
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm
            WHERE wm.ws_id = task_cycles.ws_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete task cycles in their workspaces" ON "public"."task_cycles"
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm
            WHERE wm.ws_id = task_cycles.ws_id AND wm.user_id = auth.uid()
        )
    );

-- RLS policies for task_cycle_tasks
CREATE POLICY "Users can view task cycle tasks in their workspaces" ON "public"."task_cycle_tasks"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."task_cycles" tc
            JOIN "public"."workspace_members" wm ON wm.ws_id = tc.ws_id
            WHERE tc.id = task_cycle_tasks.cycle_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage task cycle tasks in their workspaces" ON "public"."task_cycle_tasks"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."task_cycles" tc
            JOIN "public"."workspace_members" wm ON wm.ws_id = tc.ws_id
            WHERE tc.id = task_cycle_tasks.cycle_id AND wm.user_id = auth.uid()
        )
    );

-- Grants
GRANT ALL ON "public"."task_cycles" TO "authenticated";
GRANT ALL ON "public"."task_cycle_tasks" TO "authenticated";


