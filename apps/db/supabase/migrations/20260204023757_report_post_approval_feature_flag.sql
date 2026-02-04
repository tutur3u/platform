-- Enable post and report approval by default for all workspaces
-- This migration adds the configuration keys to workspace_configs,
-- updates the approval handlers to respect these configurations,
-- and aligns RLS policies for main tables with their logs tables.

-- 1. Update handle_report_approval to respect ENABLE_REPORT_APPROVAL and fix fall-through logic
CREATE OR REPLACE FUNCTION public.handle_report_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ws_id uuid;
    v_user_id uuid;
    v_has_approve_permission boolean;
    v_has_create_permission boolean;
    v_enable_approval boolean;
BEGIN
    -- Get the current user ID
    v_user_id := auth.uid();
    
    -- Bypass if run by service role or migration
    IF v_user_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Get workspace ID for this report
    IF TG_OP = 'UPDATE' THEN
        v_ws_id := get_report_workspace_id(NEW.id);
    ELSE
        -- For INSERT, we need to get it from the group_id
        SELECT ws_id INTO v_ws_id
        FROM workspace_user_groups
        WHERE id = NEW.group_id;
    END IF;

    -- Check if approval is enabled for this workspace
    SELECT COALESCE(value = 'true', true) INTO v_enable_approval
    FROM workspace_configs
    WHERE ws_id = v_ws_id AND id = 'ENABLE_REPORT_APPROVAL';
    
    -- Check if user has approve and create permissions
    v_has_approve_permission := has_workspace_permission(v_ws_id, v_user_id, 'approve_reports');
    v_has_create_permission := has_workspace_permission(v_ws_id, v_user_id, 'create_user_groups_reports');
    
    -- If approval is disabled, auto-approve if user has create permission
    -- Then exit to prevent falling into approval-enabled logic
    IF NOT v_enable_approval THEN
        IF v_has_create_permission THEN
            NEW.report_approval_status := 'APPROVED';
            NEW.approved_by := v_user_id;
            NEW.approved_at := now();
            NEW.rejected_by := NULL;
            NEW.rejected_at := NULL;
            NEW.rejection_reason := NULL;
        END IF;
        RETURN NEW;
    END IF;

    -- If user has approve permission, allow their chosen status (APPROVED or REJECTED)
    IF v_has_approve_permission THEN
        -- Auto-approve if user has both create and approve permissions and status is PENDING
        IF NEW.report_approval_status = 'PENDING' AND v_has_create_permission THEN
            NEW.report_approval_status := 'APPROVED';
        END IF;

        IF NEW.report_approval_status = 'REJECTED' THEN
            -- Validate rejection_reason is provided
            IF NEW.rejection_reason IS NULL OR NEW.rejection_reason = '' THEN
                RAISE EXCEPTION 'rejection_reason is required when rejecting a report';
            END IF;
            -- Allow rejection, ensure required fields are set
            IF NEW.rejected_by IS NULL THEN
                NEW.rejected_by := v_user_id;
            END IF;
            IF NEW.rejected_at IS NULL THEN
                NEW.rejected_at := now();
            END IF;
            -- Clear approval fields
            NEW.approved_by := NULL;
            NEW.approved_at := NULL;
        ELSIF NEW.report_approval_status = 'APPROVED' THEN
            -- Allow approval
            IF NEW.approved_by IS NULL THEN
                NEW.approved_by := v_user_id;
            END IF;
            IF NEW.approved_at IS NULL THEN
                NEW.approved_at := now();
            END IF;
            -- Clear rejection fields
            NEW.rejected_by := NULL;
            NEW.rejected_at := NULL;
            NEW.rejection_reason := NULL;
        END IF;
    ELSE
        -- User doesn't have approve permission
        -- If they're trying to set approval fields directly, reject
        IF TG_OP = 'UPDATE' AND (
            NEW.report_approval_status IS DISTINCT FROM OLD.report_approval_status OR
            NEW.approved_by IS DISTINCT FROM OLD.approved_by OR
            NEW.approved_at IS DISTINCT FROM OLD.approved_at OR
            NEW.rejected_by IS DISTINCT FROM OLD.rejected_by OR
            NEW.rejected_at IS DISTINCT FROM OLD.rejected_at OR
            NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
        ) THEN
            RAISE EXCEPTION 'You do not have permission to modify approval fields';
        END IF;
        
        -- Force pending status and clear approval fields
        NEW.report_approval_status := 'PENDING';
        NEW.approved_by := NULL;
        NEW.approved_at := NULL;
        NEW.rejected_by := NULL;
        NEW.rejected_at := NULL;
        NEW.rejection_reason := NULL;
    END IF;
    
    RETURN NEW;
END;
$$;

-- 2. Update handle_post_approval to respect ENABLE_POST_APPROVAL and fix fall-through logic
CREATE OR REPLACE FUNCTION public.handle_post_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ws_id uuid;
    v_user_id uuid;
    v_has_approve_permission boolean;
    v_has_create_permission boolean;
    v_enable_approval boolean;
BEGIN
    -- Get the current user ID
    v_user_id := auth.uid();
    
    -- Bypass if run by service role or migration
    IF v_user_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Get workspace ID for this post
    IF TG_OP = 'UPDATE' THEN
        v_ws_id := get_post_workspace_id(NEW.id);
    ELSE
        -- For INSERT, we need to get it from the group_id
        SELECT ws_id INTO v_ws_id
        FROM workspace_user_groups
        WHERE id = NEW.group_id;
    END IF;

    -- Check if approval is enabled for this workspace
    SELECT COALESCE(value = 'true', true) INTO v_enable_approval
    FROM workspace_configs
    WHERE ws_id = v_ws_id AND id = 'ENABLE_POST_APPROVAL';
    
    -- Check if user has approve and create permissions
    v_has_approve_permission := has_workspace_permission(v_ws_id, v_user_id, 'approve_posts');
    v_has_create_permission := has_workspace_permission(v_ws_id, v_user_id, 'create_user_groups_posts');
    
    -- If approval is disabled, auto-approve if user has create permission
    -- Then exit to prevent falling into approval-enabled logic
    IF NOT v_enable_approval THEN
        IF v_has_create_permission THEN
            NEW.post_approval_status := 'APPROVED';
            NEW.approved_by := v_user_id;
            NEW.approved_at := now();
            NEW.rejected_by := NULL;
            NEW.rejected_at := NULL;
            NEW.rejection_reason := NULL;
        END IF;
        RETURN NEW;
    END IF;

    -- If user has approve permission, allow their chosen status (APPROVED or REJECTED)
    IF v_has_approve_permission THEN
        -- Auto-approve if user has both create and approve permissions and status is PENDING
        IF NEW.post_approval_status = 'PENDING' AND v_has_create_permission THEN
            NEW.post_approval_status := 'APPROVED';
        END IF;

        IF NEW.post_approval_status = 'REJECTED' THEN
            -- Validate rejection_reason is provided
            IF NEW.rejection_reason IS NULL OR NEW.rejection_reason = '' THEN
                RAISE EXCEPTION 'rejection_reason is required when rejecting a post';
            END IF;
            -- Allow rejection, ensure required fields are set
            IF NEW.rejected_by IS NULL THEN
                NEW.rejected_by := v_user_id;
            END IF;
            IF NEW.rejected_at IS NULL THEN
                NEW.rejected_at := now();
            END IF;
            -- Clear approval fields
            NEW.approved_by := NULL;
            NEW.approved_at := NULL;
        ELSIF NEW.post_approval_status = 'APPROVED' THEN
            -- Allow approval
            IF NEW.approved_by IS NULL THEN
                NEW.approved_by := v_user_id;
            END IF;
            IF NEW.approved_at IS NULL THEN
                NEW.approved_at := now();
            END IF;
            -- Clear rejection fields
            NEW.rejected_by := NULL;
            NEW.rejected_at := NULL;
            NEW.rejection_reason := NULL;
        END IF;
    ELSE
        -- User doesn't have approve permission
        -- If they're trying to set approval fields directly, reject
        IF TG_OP = 'UPDATE' AND (
            NEW.post_approval_status IS DISTINCT FROM OLD.post_approval_status OR
            NEW.approved_by IS DISTINCT FROM OLD.approved_by OR
            NEW.approved_at IS DISTINCT FROM OLD.approved_at OR
            NEW.rejected_by IS DISTINCT FROM OLD.rejected_by OR
            NEW.rejected_at IS DISTINCT FROM OLD.rejected_at OR
            NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
        ) THEN
            RAISE EXCEPTION 'You do not have permission to modify approval fields';
        END IF;
        
        -- Force pending status and clear approval fields
        NEW.post_approval_status := 'PENDING';
        NEW.approved_by := NULL;
        NEW.approved_at := NULL;
        NEW.rejected_by := NULL;
        NEW.rejected_at := NULL;
        NEW.rejection_reason := NULL;
    END IF;
    
    RETURN NEW;
END;
$$;

-- 3. Align RLS policies for main tables with their logs tables

-- 3a. external_user_monthly_reports
DROP POLICY IF EXISTS "Allow insert access for workspace users" ON "public"."external_user_monthly_reports";
DROP POLICY IF EXISTS "Allow member managers to manage reports" ON "public"."external_user_monthly_reports";
DROP POLICY IF EXISTS "Allow read access for workspace users" ON "public"."external_user_monthly_reports";
DROP POLICY IF EXISTS "Allow update access for workspace_users" ON "public"."external_user_monthly_reports";

CREATE POLICY "Allow view reports"
ON "public"."external_user_monthly_reports"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  public.has_workspace_permission(
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_reports.user_id),
    auth.uid(),
    'view_user_groups_reports'
  )
);

CREATE POLICY "Allow create reports"
ON "public"."external_user_monthly_reports"
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_workspace_permission(
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_reports.user_id),
    auth.uid(),
    'create_user_groups_reports'
  )
);

CREATE POLICY "Allow update reports"
ON "public"."external_user_monthly_reports"
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  public.has_workspace_permission(
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_reports.user_id),
    auth.uid(),
    'update_user_groups_reports'
  )
)
WITH CHECK (
  public.has_workspace_permission(
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_reports.user_id),
    auth.uid(),
    'update_user_groups_reports'
  )
);

CREATE POLICY "Allow delete reports"
ON "public"."external_user_monthly_reports"
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
  public.has_workspace_permission(
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_reports.user_id),
    auth.uid(),
    'delete_user_groups_reports'
  )
);

-- 3b. user_group_posts
DROP POLICY IF EXISTS "Allow access for workspace users" ON "public"."user_group_posts";

CREATE POLICY "Allow view posts"
ON "public"."user_group_posts"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  public.has_workspace_permission(
    (SELECT wug.ws_id FROM workspace_user_groups wug WHERE wug.id = user_group_posts.group_id),
    auth.uid(),
    'view_user_groups_posts'
  )
);

CREATE POLICY "Allow create posts"
ON "public"."user_group_posts"
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_workspace_permission(
    (SELECT wug.ws_id FROM workspace_user_groups wug WHERE wug.id = user_group_posts.group_id),
    auth.uid(),
    'create_user_groups_posts'
  )
);

CREATE POLICY "Allow update posts"
ON "public"."user_group_posts"
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  public.has_workspace_permission(
    (SELECT wug.ws_id FROM workspace_user_groups wug WHERE wug.id = user_group_posts.group_id),
    auth.uid(),
    'update_user_groups_posts'
  )
)
WITH CHECK (
  public.has_workspace_permission(
    (SELECT wug.ws_id FROM workspace_user_groups wug WHERE wug.id = user_group_posts.group_id),
    auth.uid(),
    'update_user_groups_posts'
  )
);

CREATE POLICY "Allow delete posts"
ON "public"."user_group_posts"
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
  public.has_workspace_permission(
    (SELECT wug.ws_id FROM workspace_user_groups wug WHERE wug.id = user_group_posts.group_id),
    auth.uid(),
    'delete_user_groups_posts'
  )
);
