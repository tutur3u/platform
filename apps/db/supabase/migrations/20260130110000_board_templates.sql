-- Board Templates Migration

-- ============================================================================
-- ENUM: board_template_visibility
-- Defines who can see the template
-- ============================================================================
CREATE TYPE "public"."board_template_visibility" AS ENUM ('private', 'workspace', 'public');

-- ============================================================================
-- TABLE: board_templates
-- Stores board snapshots that can be reused
-- ============================================================================
CREATE TABLE "public"."board_templates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "ws_id" uuid NOT NULL,
  "created_by" uuid,
  "source_board_id" uuid,
  "name" text NOT NULL,
  "description" text,
  "visibility" board_template_visibility NOT NULL DEFAULT 'private',
  "content" jsonb NOT NULL, -- Stores lists, tasks, labels, settings
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "board_templates_ws_id_fkey" 
    FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT "board_templates_created_by_fkey" 
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT "board_templates_source_board_id_fkey" 
    FOREIGN KEY (source_board_id) REFERENCES workspace_boards(id) ON DELETE SET NULL
);

-- ============================================================================
-- TABLE: board_template_shares
-- Collaborative access for private templates
-- ============================================================================
CREATE TABLE "public"."board_template_shares" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "template_id" uuid NOT NULL,
  "user_id" uuid,
  "email" text,
  "permission" text NOT NULL DEFAULT 'view',
  "created_by" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "board_template_shares_template_id_fkey" 
    FOREIGN KEY (template_id) REFERENCES board_templates(id) ON DELETE CASCADE,
  CONSTRAINT "board_template_shares_user_id_fkey" 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT "board_template_shares_created_by_fkey" 
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT "board_template_shares_permission_check" 
    CHECK (permission IN ('view')),
  CONSTRAINT "board_template_shares_recipient_check" 
    CHECK (user_id IS NOT NULL OR email IS NOT NULL),
  CONSTRAINT "board_template_shares_unique_user" 
    UNIQUE ("template_id", "user_id")
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX board_templates_ws_id_idx ON board_templates(ws_id);
CREATE INDEX board_templates_created_by_idx ON board_templates(created_by);
CREATE INDEX board_template_shares_template_id_idx ON board_template_shares(template_id);
CREATE INDEX board_template_shares_user_id_idx ON board_template_shares(user_id);

-- ============================================================================
-- ENABLE RLS
-- ============================================================================
ALTER TABLE board_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_template_shares ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Check if template is accessible to user
CREATE OR REPLACE FUNCTION public.is_board_template_accessible(p_template_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_template record;
BEGIN
  SELECT * FROM board_templates WHERE id = p_template_id INTO v_template;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Creator always has access
  IF v_template.created_by = auth.uid() THEN
    RETURN true;
  END IF;

  -- Public access
  IF v_template.visibility = 'public' THEN
    RETURN true;
  END IF;

  -- Workspace access
  IF v_template.visibility = 'workspace' AND is_org_member(v_template.ws_id, auth.uid()) THEN
    RETURN true;
  END IF;

  -- Direct share (by user_id)
  IF EXISTS (
    SELECT 1 FROM board_template_shares
    WHERE template_id = p_template_id AND user_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  -- Direct share (by email)
  IF EXISTS (
    SELECT 1 FROM board_template_shares ts
    JOIN user_private_details upd ON upd.user_id = auth.uid()
    WHERE ts.template_id = p_template_id AND LOWER(ts.email) = LOWER(upd.email)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- ============================================================================
-- RLS POLICIES: board_templates
-- ============================================================================

CREATE POLICY "Allow users to view accessible templates"
ON board_templates FOR SELECT
TO authenticated
USING (is_board_template_accessible(id));

CREATE POLICY "Allow workspace members to create templates"
ON board_templates FOR INSERT
TO authenticated
WITH CHECK (is_org_member(ws_id, auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Allow owners to update templates"
ON board_templates FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Allow owners to delete templates"
ON board_templates FOR DELETE
TO authenticated
USING (created_by = auth.uid());

-- ============================================================================
-- RLS POLICIES: board_template_shares
-- ============================================================================

CREATE POLICY "Allow owners and workspace members to view shares"
ON board_template_shares FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM board_templates bt
    WHERE bt.id = template_id AND (bt.created_by = auth.uid() OR (bt.visibility = 'workspace' AND is_org_member(bt.ws_id, auth.uid())))
  )
  OR user_id = auth.uid()
  OR LOWER(email) = LOWER((SELECT email FROM user_private_details WHERE user_id = auth.uid()))
);

CREATE POLICY "Allow owners to manage shares"
ON board_template_shares FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM board_templates bt
    WHERE bt.id = template_id AND bt.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM board_templates bt
    WHERE bt.id = template_id AND bt.created_by = auth.uid()
  )
);

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON board_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON board_template_shares TO authenticated;

GRANT ALL ON board_templates TO service_role;
GRANT ALL ON board_template_shares TO service_role;
