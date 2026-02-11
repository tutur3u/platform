create type "public"."estimation_type" as enum ('exponential', 'fibonacci', 'linear', 't-shirt');

create table "public"."workspace_task_labels" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "color" text not null,
    "created_at" timestamp with time zone not null default now(),
    "creator_id" uuid default auth.uid()
);


alter table "public"."workspace_task_labels" enable row level security;

alter table "public"."workspace_boards" add column "estimation_type" estimation_type;

CREATE UNIQUE INDEX workspace_task_labels_pkey ON public.workspace_task_labels USING btree (id);

alter table "public"."workspace_task_labels" add constraint "workspace_task_labels_pkey" PRIMARY KEY using index "workspace_task_labels_pkey";

alter table "public"."workspace_task_labels" add constraint "workspace_task_labels_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."workspace_task_labels" validate constraint "workspace_task_labels_creator_id_fkey";

grant delete on table "public"."workspace_task_labels" to "anon";

grant insert on table "public"."workspace_task_labels" to "anon";

grant references on table "public"."workspace_task_labels" to "anon";

grant select on table "public"."workspace_task_labels" to "anon";

grant trigger on table "public"."workspace_task_labels" to "anon";

grant truncate on table "public"."workspace_task_labels" to "anon";

grant update on table "public"."workspace_task_labels" to "anon";

grant delete on table "public"."workspace_task_labels" to "authenticated";

grant insert on table "public"."workspace_task_labels" to "authenticated";

grant references on table "public"."workspace_task_labels" to "authenticated";

grant select on table "public"."workspace_task_labels" to "authenticated";

grant trigger on table "public"."workspace_task_labels" to "authenticated";

grant truncate on table "public"."workspace_task_labels" to "authenticated";

grant update on table "public"."workspace_task_labels" to "authenticated";

grant delete on table "public"."workspace_task_labels" to "service_role";

grant insert on table "public"."workspace_task_labels" to "service_role";

grant references on table "public"."workspace_task_labels" to "service_role";

grant select on table "public"."workspace_task_labels" to "service_role";

grant trigger on table "public"."workspace_task_labels" to "service_role";

grant truncate on table "public"."workspace_task_labels" to "service_role";

grant update on table "public"."workspace_task_labels" to "service_role";

-- Add ws_id column to workspace_task_labels table
ALTER TABLE "public"."workspace_task_labels" 
ADD COLUMN "ws_id" uuid NOT NULL;

-- Add foreign key constraint for workspace relationship
ALTER TABLE "public"."workspace_task_labels" 
ADD CONSTRAINT "workspace_task_labels_ws_id_fkey" 
FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- Create index for efficient workspace-based queries
CREATE INDEX idx_workspace_task_labels_ws_id ON "public"."workspace_task_labels" (ws_id);

-- Add RLS policies for workspace access
CREATE POLICY "Users can view labels in their workspaces" ON "public"."workspace_task_labels"
    FOR SELECT USING (
        ws_id IN (
            SELECT ws_id FROM workspace_members 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create labels in their workspaces" ON "public"."workspace_task_labels"
    FOR INSERT WITH CHECK (
        ws_id IN (
            SELECT ws_id FROM workspace_members 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update labels in their workspaces" ON "public"."workspace_task_labels"
    FOR UPDATE USING (
        ws_id IN (
            SELECT ws_id FROM workspace_members 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete labels in their workspaces" ON "public"."workspace_task_labels"
    FOR DELETE USING (
        ws_id IN (
            SELECT ws_id FROM workspace_members 
            WHERE user_id = auth.uid()
        )
    );

alter table "public"."workspace_boards" add column "extended_estimation" boolean not null default false;

-- Add additional estimation configuration fields to workspace_boards
alter table "public"."workspace_boards" 
add column "allow_zero_estimates" boolean not null default true,
add column "count_unestimated_issues" boolean not null default false;

-- Add comments for clarity
comment on column "public"."workspace_boards"."allow_zero_estimates" is 'When enabled, issues can be estimated with zero points';
comment on column "public"."workspace_boards"."count_unestimated_issues" is 'When enabled, unestimated issues count as 1 estimate point. When disabled, they count as 0';

alter table "public"."tasks" add column "estimation_points" smallint;
-- Ensure that estimation_points ranges from 0 to 8 (inclusive)
ALTER TABLE "public"."tasks" ADD CONSTRAINT "tasks_estimation_points_check" CHECK (estimation_points >= 0 AND estimation_points <= 8);

-- If board change extended_estimation to false, update tasks that has estimation_points > 5 to 5
CREATE OR REPLACE FUNCTION enforce_extended_estimation()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.extended_estimation = FALSE THEN
        -- tasks doesn't have board_id, so we need to join with workspace_boards via list_id
        UPDATE "public"."tasks" t
        SET estimation_points = 5
        FROM "public"."task_lists" tl
        JOIN "public"."workspace_boards" wb ON tl.board_id = wb.id
        WHERE t.list_id = tl.id
          AND wb.id = NEW.id
          AND t.estimation_points > 5;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_extended_estimation
AFTER UPDATE OF extended_estimation ON "public"."workspace_boards"
FOR EACH ROW EXECUTE FUNCTION enforce_extended_estimation();

-- Add a table to link tasks and labels (many-to-many relationship)
CREATE TABLE "public"."task_labels" (
    "task_id" uuid NOT NULL,
    "label_id" uuid NOT NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, label_id),
    CONSTRAINT "task_labels_task_id_fkey" FOREIGN KEY (task_id) REFERENCES "public"."tasks"(id) ON DELETE CASCADE,
    CONSTRAINT "task_labels_label_id_fkey" FOREIGN KEY (label_id) REFERENCES "public"."workspace_task_labels"(id) ON DELETE CASCADE
);
CREATE INDEX idx_task_labels_task_id ON "public"."task_labels" (task_id);
CREATE INDEX idx_task_labels_label_id ON "public"."task_labels" (label_id);
ALTER TABLE "public"."task_labels" ENABLE ROW LEVEL SECURITY;
-- Add RLS policies for task_labels table
CREATE POLICY "Users can view task labels for tasks in their workspaces" ON "public"."task_labels"
    FOR SELECT USING (
        exists (select 1 from public.tasks t where t.id = task_id) and
        exists (select 1 from public.workspace_task_labels tl where tl.id = label_id)
    );
CREATE POLICY "Users can insert task labels for tasks in their workspaces" ON "public"."task_labels"
    FOR INSERT WITH CHECK (
        exists (select 1 from public.tasks t where t.id = task_id) and
        exists (select 1 from public.workspace_task_labels tl where tl.id = label_id)
    );
CREATE POLICY "Users can delete task labels for tasks in their workspaces" ON "public"."task_labels"
    FOR DELETE USING (
        exists (select 1 from public.tasks t where t.id = task_id) and
        exists (select 1 from public.workspace_task_labels tl where tl.id = label_id)
    );
GRANT SELECT, INSERT, DELETE ON TABLE "public"."task_labels" TO "anon";
GRANT SELECT, INSERT, DELETE ON TABLE "public"."task_labels" TO "authenticated";
GRANT SELECT, INSERT, DELETE ON TABLE "public"."task_labels" TO "service_role";