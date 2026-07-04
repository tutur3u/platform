-- First-class single-task templates.

CREATE TYPE "public"."task_template_visibility" AS ENUM ('private', 'workspace');

CREATE TABLE "public"."task_templates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "ws_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "created_by" uuid NOT NULL DEFAULT auth.uid() REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "source_task_id" uuid REFERENCES "public"."tasks"("id") ON DELETE SET NULL,
  "default_board_id" uuid REFERENCES "public"."workspace_boards"("id") ON DELETE SET NULL,
  "default_list_id" uuid REFERENCES "public"."task_lists"("id") ON DELETE SET NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "task_name" text NOT NULL,
  "description" text,
  "description_yjs_state" int2[],
  "visibility" "public"."task_template_visibility" NOT NULL DEFAULT 'private',
  "priority" "public"."task_priority",
  "start_date" timestamptz,
  "end_date" timestamptz,
  "estimation_points" smallint CHECK ("estimation_points" IS NULL OR ("estimation_points" >= 0 AND "estimation_points" <= 8)),
  "label_ids" uuid[] NOT NULL DEFAULT '{}',
  "assignee_ids" uuid[] NOT NULL DEFAULT '{}',
  "project_ids" uuid[] NOT NULL DEFAULT '{}',
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "task_templates_slug_not_blank" CHECK (length(btrim("slug")) > 0),
  CONSTRAINT "task_templates_name_not_blank" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "task_templates_task_name_not_blank" CHECK (length(btrim("task_name")) > 0)
);

CREATE INDEX "task_templates_ws_id_idx" ON "public"."task_templates"("ws_id");
CREATE INDEX "task_templates_created_by_idx" ON "public"."task_templates"("created_by");
CREATE INDEX "task_templates_default_board_id_idx" ON "public"."task_templates"("default_board_id");
CREATE INDEX "task_templates_default_list_id_idx" ON "public"."task_templates"("default_list_id");
CREATE INDEX "task_templates_active_ws_created_idx" ON "public"."task_templates"("ws_id", "created_at" DESC)
  WHERE "archived_at" IS NULL;

CREATE UNIQUE INDEX "task_templates_private_owner_slug_active_key"
  ON "public"."task_templates"("ws_id", "created_by", lower("slug"))
  WHERE "archived_at" IS NULL AND "visibility" = 'private';

CREATE UNIQUE INDEX "task_templates_workspace_slug_active_key"
  ON "public"."task_templates"("ws_id", lower("slug"))
  WHERE "archived_at" IS NULL AND "visibility" = 'workspace';

ALTER TABLE "public"."task_templates" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION "public"."touch_task_template_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "touch_task_templates_updated_at"
  BEFORE UPDATE ON "public"."task_templates"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."touch_task_template_updated_at"();

CREATE OR REPLACE FUNCTION "public"."validate_task_template_scope"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invalid_count integer;
BEGIN
  NEW.slug = lower(btrim(NEW.slug));
  NEW.name = btrim(NEW.name);
  NEW.task_name = btrim(NEW.task_name);

  IF NEW.default_board_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_boards wb
    WHERE wb.id = NEW.default_board_id
      AND wb.ws_id = NEW.ws_id
      AND wb.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'task_templates.default_board_id must belong to the template workspace';
  END IF;

  IF NEW.default_list_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.task_lists tl
    JOIN public.workspace_boards wb ON wb.id = tl.board_id
    WHERE tl.id = NEW.default_list_id
      AND tl.deleted = false
      AND wb.ws_id = NEW.ws_id
      AND wb.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'task_templates.default_list_id must belong to the template workspace';
  END IF;

  IF NEW.source_task_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.tasks t
    JOIN public.task_lists tl ON tl.id = t.list_id
    JOIN public.workspace_boards wb ON wb.id = tl.board_id
    WHERE t.id = NEW.source_task_id
      AND wb.ws_id = NEW.ws_id
  ) THEN
    RAISE EXCEPTION 'task_templates.source_task_id must belong to the template workspace';
  END IF;

  IF NEW.label_ids IS NOT NULL AND array_length(NEW.label_ids, 1) IS NOT NULL THEN
    SELECT count(*) INTO invalid_count
    FROM unnest(NEW.label_ids) AS lid
    WHERE NOT EXISTS (
      SELECT 1 FROM public.workspace_task_labels wtl
      WHERE wtl.id = lid AND wtl.ws_id = NEW.ws_id
    );

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'task_templates.label_ids contains % invalid label id(s)', invalid_count;
    END IF;
  END IF;

  IF NEW.project_ids IS NOT NULL AND array_length(NEW.project_ids, 1) IS NOT NULL THEN
    SELECT count(*) INTO invalid_count
    FROM unnest(NEW.project_ids) AS pid
    WHERE NOT EXISTS (
      SELECT 1 FROM public.task_projects tp
      WHERE tp.id = pid AND tp.ws_id = NEW.ws_id
    );

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'task_templates.project_ids contains % invalid project id(s)', invalid_count;
    END IF;
  END IF;

  IF NEW.assignee_ids IS NOT NULL AND array_length(NEW.assignee_ids, 1) IS NOT NULL THEN
    SELECT count(*) INTO invalid_count
    FROM unnest(NEW.assignee_ids) AS uid
    WHERE NOT EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.user_id = uid
        AND wm.ws_id = NEW.ws_id
        AND wm.type = 'MEMBER'
    );

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'task_templates.assignee_ids contains % invalid member id(s)', invalid_count;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "validate_task_template_scope"
  BEFORE INSERT OR UPDATE ON "public"."task_templates"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."validate_task_template_scope"();

CREATE OR REPLACE FUNCTION "public"."remove_label_from_task_templates"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.task_templates
  SET label_ids = array_remove(label_ids, OLD.id)
  WHERE OLD.id = ANY(label_ids);
  RETURN OLD;
END;
$$;

CREATE TRIGGER "task_templates_remove_deleted_label"
  AFTER DELETE ON "public"."workspace_task_labels"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."remove_label_from_task_templates"();

CREATE OR REPLACE FUNCTION "public"."remove_project_from_task_templates"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.task_templates
  SET project_ids = array_remove(project_ids, OLD.id)
  WHERE OLD.id = ANY(project_ids);
  RETURN OLD;
END;
$$;

CREATE TRIGGER "task_templates_remove_deleted_project"
  AFTER DELETE ON "public"."task_projects"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."remove_project_from_task_templates"();

CREATE OR REPLACE FUNCTION "public"."remove_assignee_from_task_templates"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.task_templates
  SET assignee_ids = array_remove(assignee_ids, OLD.user_id)
  WHERE OLD.user_id = ANY(assignee_ids)
    AND ws_id = OLD.ws_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "task_templates_remove_deleted_member"
  AFTER DELETE ON "public"."workspace_members"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."remove_assignee_from_task_templates"();

CREATE POLICY "task_templates_select_accessible"
ON "public"."task_templates"
FOR SELECT
TO authenticated
USING (
  "created_by" = auth.uid()
  OR (
    "visibility" = 'workspace'
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.ws_id = task_templates.ws_id
        AND wm.user_id = auth.uid()
        AND wm.type = 'MEMBER'
    )
  )
);

CREATE POLICY "task_templates_insert_member"
ON "public"."task_templates"
FOR INSERT
TO authenticated
WITH CHECK (
  "created_by" = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.ws_id = task_templates.ws_id
      AND wm.user_id = auth.uid()
      AND wm.type = 'MEMBER'
  )
);

CREATE POLICY "task_templates_update_owner"
ON "public"."task_templates"
FOR UPDATE
TO authenticated
USING ("created_by" = auth.uid())
WITH CHECK ("created_by" = auth.uid());

CREATE POLICY "task_templates_delete_owner"
ON "public"."task_templates"
FOR DELETE
TO authenticated
USING ("created_by" = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."task_templates" TO authenticated;
GRANT ALL ON "public"."task_templates" TO service_role;
