-- task_drafts table: stores draft tasks scoped to user + workspace
CREATE TABLE "public"."task_drafts" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "ws_id" uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    "creator_id" uuid NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
    "board_id" uuid REFERENCES workspace_boards(id) ON DELETE SET NULL,
    "list_id" uuid REFERENCES task_lists(id) ON DELETE SET NULL,
    "name" text NOT NULL,
    "description" text,
    "priority" public.task_priority,
    "start_date" timestamptz,
    "end_date" timestamptz,
    "estimation_points" smallint CHECK (estimation_points >= 0 AND estimation_points <= 8),
    "label_ids" uuid[] DEFAULT '{}',
    "assignee_ids" uuid[] DEFAULT '{}',
    "project_ids" uuid[] DEFAULT '{}',
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

ALTER TABLE "public"."task_drafts" ENABLE ROW LEVEL SECURITY;

-- RLS: Only the creator can see/manage their own drafts within a workspace
CREATE POLICY "Users can manage their own drafts"
    ON "public"."task_drafts"
    FOR ALL TO authenticated
    USING (creator_id = auth.uid())
    WITH CHECK (creator_id = auth.uid());

-- Trigger: Clean up drafts when user is removed from workspace
CREATE OR REPLACE FUNCTION delete_drafts_on_member_removal()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.task_drafts
    WHERE ws_id = OLD.ws_id AND creator_id = OLD.user_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_workspace_member_delete
    AFTER DELETE ON public.workspace_members
    FOR EACH ROW
    EXECUTE FUNCTION delete_drafts_on_member_removal();

-- Validate label_ids: every UUID must exist in workspace_task_labels within the same workspace
CREATE OR REPLACE FUNCTION validate_task_draft_label_ids()
RETURNS TRIGGER AS $$
DECLARE
    invalid_count integer;
BEGIN
    IF NEW.label_ids IS NULL OR array_length(NEW.label_ids, 1) IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT count(*) INTO invalid_count
    FROM unnest(NEW.label_ids) AS lid
    WHERE NOT EXISTS (
        SELECT 1 FROM public.workspace_task_labels
        WHERE id = lid AND ws_id = NEW.ws_id
    );
    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'task_drafts.label_ids contains % invalid label id(s) for workspace %',
            invalid_count, NEW.ws_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER validate_draft_labels
    BEFORE INSERT OR UPDATE OF label_ids ON public.task_drafts
    FOR EACH ROW
    EXECUTE FUNCTION validate_task_draft_label_ids();

-- Validate assignee_ids: every UUID must exist in users table
CREATE OR REPLACE FUNCTION validate_task_draft_assignee_ids()
RETURNS TRIGGER AS $$
DECLARE
    invalid_count integer;
BEGIN
    IF NEW.assignee_ids IS NULL OR array_length(NEW.assignee_ids, 1) IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT count(*) INTO invalid_count
    FROM unnest(NEW.assignee_ids) AS uid
    WHERE NOT EXISTS (
        SELECT 1 FROM public.users WHERE id = uid
    );
    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'task_drafts.assignee_ids contains % invalid user id(s)', invalid_count;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER validate_draft_assignees
    BEFORE INSERT OR UPDATE OF assignee_ids ON public.task_drafts
    FOR EACH ROW
    EXECUTE FUNCTION validate_task_draft_assignee_ids();

-- Cascade cleanup: remove deleted label from all draft label_ids arrays
CREATE OR REPLACE FUNCTION cascade_label_delete_from_drafts()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.task_drafts
    SET label_ids = array_remove(label_ids, OLD.id)
    WHERE OLD.id = ANY(label_ids);
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_label_delete_clean_drafts
    AFTER DELETE ON public.workspace_task_labels
    FOR EACH ROW
    EXECUTE FUNCTION cascade_label_delete_from_drafts();

-- Cascade cleanup: remove deleted user from all draft assignee_ids arrays
CREATE OR REPLACE FUNCTION cascade_user_delete_from_draft_assignees()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.task_drafts
    SET assignee_ids = array_remove(assignee_ids, OLD.id)
    WHERE OLD.id = ANY(assignee_ids);
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_user_delete_clean_draft_assignees
    AFTER DELETE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION cascade_user_delete_from_draft_assignees();

-- Validate project_ids: every UUID must exist in task_projects within the same workspace
CREATE OR REPLACE FUNCTION validate_task_draft_project_ids()
RETURNS TRIGGER AS $$
DECLARE
    invalid_count integer;
BEGIN
    IF NEW.project_ids IS NULL OR array_length(NEW.project_ids, 1) IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT count(*) INTO invalid_count
    FROM unnest(NEW.project_ids) AS pid
    WHERE NOT EXISTS (
        SELECT 1 FROM public.task_projects
        WHERE id = pid AND ws_id = NEW.ws_id
    );
    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'task_drafts.project_ids contains % invalid project id(s) for workspace %',
            invalid_count, NEW.ws_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER validate_draft_projects
    BEFORE INSERT OR UPDATE OF project_ids ON public.task_drafts
    FOR EACH ROW
    EXECUTE FUNCTION validate_task_draft_project_ids();

-- Cascade cleanup: remove deleted project from all draft project_ids arrays
CREATE OR REPLACE FUNCTION cascade_project_delete_from_drafts()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.task_drafts
    SET project_ids = array_remove(project_ids, OLD.id)
    WHERE OLD.id = ANY(project_ids);
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_project_delete_clean_drafts
    AFTER DELETE ON public.task_projects
    FOR EACH ROW
    EXECUTE FUNCTION cascade_project_delete_from_drafts();

-- Index for common query pattern
CREATE INDEX idx_task_drafts_creator_ws ON public.task_drafts (creator_id, ws_id);
