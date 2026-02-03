-- Track last modifier for reports and posts
ALTER TABLE public.external_user_monthly_reports
    ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE public.user_group_posts
    ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Backfill last modifier from creator/approver
UPDATE public.external_user_monthly_reports
SET updated_by = creator_id
WHERE updated_by IS NULL AND creator_id IS NOT NULL;

UPDATE public.user_group_posts
SET updated_by = creator_id
WHERE updated_by IS NULL AND creator_id IS NOT NULL;

UPDATE public.user_group_posts
SET updated_by = approved_by
WHERE updated_by IS NULL AND approved_by IS NOT NULL;

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'external_user_monthly_reports_updated_by_fkey') THEN
        ALTER TABLE public.external_user_monthly_reports
            ADD CONSTRAINT external_user_monthly_reports_updated_by_fkey
            FOREIGN KEY (updated_by) REFERENCES public.workspace_users(id)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_group_posts_updated_by_fkey') THEN
        ALTER TABLE public.user_group_posts
            ADD CONSTRAINT user_group_posts_updated_by_fkey
            FOREIGN KEY (updated_by) REFERENCES public.workspace_users(id)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
END $$;

-- Update report approval trigger to set updated_by
CREATE OR REPLACE FUNCTION public.handle_report_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ws_id uuid;
    v_user_id uuid;
    v_workspace_user_id uuid;
    v_has_approve_permission boolean;
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

    -- Map platform user to workspace user
    v_workspace_user_id := get_workspace_user_id(v_user_id, v_ws_id);

    -- Set updated_by for any write
    IF v_workspace_user_id IS NOT NULL THEN
        NEW.updated_by := v_workspace_user_id;
    END IF;

    -- Check if user has approve permission
    v_has_approve_permission := has_workspace_permission(v_ws_id, v_user_id, 'approve_reports');

    -- If user has approve permission, allow their chosen status (APPROVED or REJECTED)
    IF v_has_approve_permission THEN
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

-- Update post approval trigger to set updated_by
CREATE OR REPLACE FUNCTION public.handle_post_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ws_id uuid;
    v_user_id uuid;
    v_workspace_user_id uuid;
    v_has_approve_permission boolean;
    v_has_create_permission boolean;
BEGIN
    -- Get the current platform user ID
    v_user_id := auth.uid();

    -- Bypass if run by service role or migration
    IF v_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get workspace ID for this post
    IF TG_OP = 'UPDATE' THEN
        v_ws_id := get_post_workspace_id(NEW.id);
    ELSE
        SELECT ws_id INTO v_ws_id
        FROM workspace_user_groups
        WHERE id = NEW.group_id;
    END IF;

    -- Map platform user to workspace user
    v_workspace_user_id := get_workspace_user_id(v_user_id, v_ws_id);

    -- Set creator_id for new posts
    IF TG_OP = 'INSERT' AND NEW.creator_id IS NULL THEN
        NEW.creator_id := v_workspace_user_id;
    END IF;

    -- Set updated_by for any write
    IF v_workspace_user_id IS NOT NULL THEN
        NEW.updated_by := v_workspace_user_id;
    END IF;

    -- Check if user has approve and create permissions
    v_has_approve_permission := has_workspace_permission(v_ws_id, v_user_id, 'approve_posts');
    v_has_create_permission := has_workspace_permission(v_ws_id, v_user_id, 'create_user_groups_posts');

    -- If user has approve permission, allow their chosen status
    IF v_has_approve_permission THEN
        IF NEW.post_approval_status = 'PENDING' AND v_has_create_permission THEN
            NEW.post_approval_status := 'APPROVED';
        END IF;

        IF NEW.post_approval_status = 'REJECTED' THEN
            IF NEW.rejection_reason IS NULL OR NEW.rejection_reason = '' THEN
                RAISE EXCEPTION 'rejection_reason is required when rejecting a post';
            END IF;
            IF NEW.rejected_by IS NULL THEN
                NEW.rejected_by := v_workspace_user_id;
            END IF;
            IF NEW.rejected_at IS NULL THEN
                NEW.rejected_at := now();
            END IF;
            NEW.approved_by := NULL;
            NEW.approved_at := NULL;
        ELSIF NEW.post_approval_status = 'APPROVED' THEN
            IF NEW.approved_by IS NULL THEN
                NEW.approved_by := v_workspace_user_id;
            END IF;
            IF NEW.approved_at IS NULL THEN
                NEW.approved_at := now();
            END IF;
            NEW.rejected_by := NULL;
            NEW.rejected_at := NULL;
            NEW.rejection_reason := NULL;
        END IF;
    ELSE
        -- Force pending status for non-privileged users
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
