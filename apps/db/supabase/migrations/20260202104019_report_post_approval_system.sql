-- Create approval_status enum type if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
        CREATE TYPE public.approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    END IF;
END
$$;

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'approve_reports';
ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'approve_posts';

-- Drop existing triggers if they exist to prevent interference with backfills
DROP TRIGGER IF EXISTS trg_report_approval ON external_user_monthly_reports;
DROP TRIGGER IF EXISTS trg_post_approval ON user_group_posts;

-- Add approval columns to external_user_monthly_reports
ALTER TABLE external_user_monthly_reports 
    ADD COLUMN IF NOT EXISTS report_approval_status approval_status NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS approved_by uuid,
    ADD COLUMN IF NOT EXISTS approved_at timestamptz,
    ADD COLUMN IF NOT EXISTS rejected_by uuid,
    ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
    ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Add approval columns to user_group_posts
ALTER TABLE user_group_posts 
    ADD COLUMN IF NOT EXISTS post_approval_status approval_status NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS approved_by uuid,
    ADD COLUMN IF NOT EXISTS approved_at timestamptz,
    ADD COLUMN IF NOT EXISTS rejected_by uuid,
    ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
    ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Add approval columns to external_user_monthly_report_logs (for snapshots)
ALTER TABLE external_user_monthly_report_logs 
    ADD COLUMN IF NOT EXISTS report_approval_status approval_status NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS approved_by uuid,
    ADD COLUMN IF NOT EXISTS approved_at timestamptz,
    ADD COLUMN IF NOT EXISTS rejected_by uuid,
    ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
    ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Add check constraints for status consistency (idempotent)
DO $$
BEGIN
    -- Add report approval consistency constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'chk_report_approval_consistency' 
        AND conrelid = 'external_user_monthly_reports'::regclass
    ) THEN
        ALTER TABLE external_user_monthly_reports
            ADD CONSTRAINT chk_report_approval_consistency 
            CHECK (
                (report_approval_status = 'APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR
                (report_approval_status = 'REJECTED' AND rejected_by IS NOT NULL AND rejected_at IS NOT NULL AND rejection_reason IS NOT NULL) OR
                (report_approval_status = 'PENDING' AND approved_by IS NULL AND approved_at IS NULL AND rejected_by IS NULL AND rejected_at IS NULL AND rejection_reason IS NULL)
            );
    END IF;

    -- Add post approval consistency constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'chk_post_approval_consistency' 
        AND conrelid = 'user_group_posts'::regclass
    ) THEN
        ALTER TABLE user_group_posts
            ADD CONSTRAINT chk_post_approval_consistency 
            CHECK (
                (post_approval_status = 'APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR
                (post_approval_status = 'REJECTED' AND rejected_by IS NOT NULL AND rejected_at IS NOT NULL AND rejection_reason IS NOT NULL) OR
                (post_approval_status = 'PENDING' AND approved_by IS NULL AND approved_at IS NULL AND rejected_by IS NULL AND rejected_at IS NULL AND rejection_reason IS NULL)
            );
    END IF;
END
$$;

-- Backfill existing reports to APPROVED with creator_id as approved_by
UPDATE external_user_monthly_reports 
SET 
    report_approval_status = 'APPROVED',
    approved_by = creator_id,
    approved_at = created_at
WHERE report_approval_status = 'PENDING';


-- Backfill existing report logs to APPROVED with creator_id as approved_by
UPDATE external_user_monthly_report_logs
SET 
    report_approval_status = 'APPROVED',
    approved_by = creator_id,
    approved_at = created_at
WHERE report_approval_status = 'PENDING';

-- Backfill existing posts to APPROVED using first manager from workspace_user_groups_users as approved_by
-- Only update posts where the group has at least one manager
UPDATE user_group_posts 
SET 
    post_approval_status = 'APPROVED',
    approved_by = (
        SELECT user_id 
        FROM workspace_user_groups_users 
        WHERE workspace_user_groups_users.group_id = user_group_posts.group_id
        AND role = 'TEACHER'
        ORDER BY created_at ASC
        LIMIT 1
    ),
    approved_at = created_at
WHERE post_approval_status = 'PENDING'
AND EXISTS (
    SELECT 1 
    FROM workspace_user_groups_users 
    WHERE workspace_user_groups_users.group_id = user_group_posts.group_id
    AND role = 'TEACHER'
);

-- Create function to get workspace_id for reports
CREATE OR REPLACE FUNCTION public.get_report_workspace_id(p_report_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_ws_id uuid;
BEGIN
    SELECT wug.ws_id INTO v_ws_id
    FROM external_user_monthly_reports r
    JOIN workspace_user_groups wug ON wug.id = r.group_id
    WHERE r.id = p_report_id;
    
    RETURN v_ws_id;
END;
$$;

-- Create function to get workspace_id for posts
CREATE OR REPLACE FUNCTION public.get_post_workspace_id(p_post_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_ws_id uuid;
BEGIN
    SELECT ws_id INTO v_ws_id
    FROM workspace_user_groups
    WHERE id = (
        SELECT group_id 
        FROM user_group_posts 
        WHERE id = p_post_id
    );
    
    RETURN v_ws_id;
END;
$$;

-- Create trigger function for reports approval workflow
CREATE OR REPLACE FUNCTION public.handle_report_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ws_id uuid;
    v_user_id uuid;
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

-- Create trigger function for posts approval workflow
CREATE OR REPLACE FUNCTION public.handle_post_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ws_id uuid;
    v_user_id uuid;
    v_has_approve_permission boolean;
BEGIN
    -- Get the current user ID
    v_user_id := auth.uid();
    
    -- Get workspace ID for this post
    IF TG_OP = 'UPDATE' THEN
        v_ws_id := get_post_workspace_id(NEW.id);
    ELSE
        -- For INSERT, we need to get it from the group_id
        SELECT ws_id INTO v_ws_id
        FROM workspace_user_groups
        WHERE id = NEW.group_id;
    END IF;
    
    -- Check if user has approve permission
    v_has_approve_permission := has_workspace_permission(v_ws_id, v_user_id, 'approve_posts');
    
    -- If user has approve permission, allow their chosen status (APPROVED or REJECTED)
    IF v_has_approve_permission THEN
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

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trg_report_approval ON external_user_monthly_reports;
DROP TRIGGER IF EXISTS trg_post_approval ON user_group_posts;

-- Create triggers for reports
CREATE TRIGGER trg_report_approval
    BEFORE INSERT OR UPDATE ON external_user_monthly_reports
    FOR EACH ROW
    EXECUTE FUNCTION handle_report_approval();

-- Create triggers for posts
CREATE TRIGGER trg_post_approval
    BEFORE INSERT OR UPDATE ON user_group_posts
    FOR EACH ROW
    EXECUTE FUNCTION handle_post_approval();

-- Update the log trigger to capture approval fields
CREATE OR REPLACE FUNCTION public.log_report_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO external_user_monthly_report_logs (
        report_id,
        user_id,
        group_id,
        title,
        content,
        feedback,
        score,
        scores,
        creator_id,
        created_at,
        report_approval_status,
        approved_by,
        approved_at,
        rejected_by,
        rejected_at,
        rejection_reason
    )
    VALUES (
        NEW.id,
        NEW.user_id,
        NEW.group_id,
        NEW.title,
        NEW.content,
        NEW.feedback,
        NEW.score,
        NEW.scores,
        NEW.creator_id,
        now(),
        NEW.report_approval_status,
        NEW.approved_by,
        NEW.approved_at,
        NEW.rejected_by,
        NEW.rejected_at,
        NEW.rejection_reason
    );
    
    RETURN NEW;
END;
$$;

-- Add comments
COMMENT ON FUNCTION public.get_report_workspace_id(uuid) IS 'Retrieves the workspace ID for a given report based on its group association';
COMMENT ON FUNCTION public.get_post_workspace_id(uuid) IS 'Retrieves the workspace ID for a given post based on its group association';
COMMENT ON FUNCTION public.handle_report_approval() IS 'Trigger function that enforces approval workflow for reports based on user permissions';
COMMENT ON FUNCTION public.handle_post_approval() IS 'Trigger function that enforces approval workflow for posts based on user permissions';

-- Log report changes only after approval
DROP TRIGGER IF EXISTS trg_report_change_log ON public.external_user_monthly_reports;

CREATE TRIGGER trg_report_change_log
    AFTER UPDATE ON public.external_user_monthly_reports
    FOR EACH ROW
    WHEN (NEW.report_approval_status = 'APPROVED')
    EXECUTE FUNCTION public.log_report_change();

-- Update RLS policies on external_user_monthly_report_logs for report permissions
DROP POLICY IF EXISTS "Allow member managers to manage report logs" ON "public"."external_user_monthly_report_logs";
DROP POLICY IF EXISTS "Allow view report logs" ON "public"."external_user_monthly_report_logs";
DROP POLICY IF EXISTS "Allow create report logs" ON "public"."external_user_monthly_report_logs";
DROP POLICY IF EXISTS "Allow update report logs" ON "public"."external_user_monthly_report_logs";
DROP POLICY IF EXISTS "Allow delete report logs" ON "public"."external_user_monthly_report_logs";

-- VIEW policy: users with view_user_groups_reports permission can SELECT
CREATE POLICY "Allow view report logs"
ON "public"."external_user_monthly_report_logs"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  public.has_workspace_permission(
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_report_logs.user_id),
    auth.uid(),
    'view_user_groups_reports'
  )
);

-- CREATE policy: users with create_user_groups_reports permission can INSERT
CREATE POLICY "Allow create report logs"
ON "public"."external_user_monthly_report_logs"
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_workspace_permission(
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_report_logs.user_id),
    auth.uid(),
    'create_user_groups_reports'
  )
);

-- UPDATE policy: users with update_user_groups_reports permission can UPDATE
CREATE POLICY "Allow update report logs"
ON "public"."external_user_monthly_report_logs"
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  public.has_workspace_permission(
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_report_logs.user_id),
    auth.uid(),
    'update_user_groups_reports'
  )
)
WITH CHECK (
  public.has_workspace_permission(
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_report_logs.user_id),
    auth.uid(),
    'update_user_groups_reports'
  )
);

-- DELETE policy: users with delete_user_groups_reports permission can DELETE
CREATE POLICY "Allow delete report logs"
ON "public"."external_user_monthly_report_logs"
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
  public.has_workspace_permission(
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_report_logs.user_id),
    auth.uid(),
    'delete_user_groups_reports'
  )
);

-- Create user_group_post_logs table for tracking post snapshots and approval history
-- This enables comparison of post versions for approval workflows

-- Create the logs table
CREATE TABLE IF NOT EXISTS "public"."user_group_post_logs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "post_id" uuid NOT NULL,
    "group_id" uuid NOT NULL,
    "title" text NOT NULL DEFAULT ''::text,
    "content" text NOT NULL DEFAULT ''::text,
    "notes" text NOT NULL DEFAULT ''::text,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    -- Approval tracking columns
    "post_approval_status" public.approval_status NOT NULL DEFAULT 'PENDING',
    "approved_by" uuid,
    "approved_at" timestamptz,
    "rejected_by" uuid,
    "rejected_at" timestamptz,
    "rejection_reason" text
);

-- Enable RLS
ALTER TABLE "public"."user_group_post_logs" ENABLE ROW LEVEL SECURITY;

-- Create primary key
CREATE UNIQUE INDEX IF NOT EXISTS user_group_post_logs_pkey ON public.user_group_post_logs USING btree (id);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_group_post_logs_pkey') THEN
        ALTER TABLE "public"."user_group_post_logs" ADD CONSTRAINT "user_group_post_logs_pkey" PRIMARY KEY USING INDEX "user_group_post_logs_pkey";
    END IF;
END $$;

-- Add foreign key constraints (only for core relations)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_group_post_logs_post_id_fkey') THEN
        ALTER TABLE "public"."user_group_post_logs" 
            ADD CONSTRAINT "user_group_post_logs_post_id_fkey" 
            FOREIGN KEY (post_id) REFERENCES user_group_posts(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_group_post_logs_group_id_fkey') THEN
        ALTER TABLE "public"."user_group_post_logs" 
            ADD CONSTRAINT "user_group_post_logs_group_id_fkey" 
            FOREIGN KEY (group_id) REFERENCES workspace_user_groups(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
    END IF;
END $$;

ALTER TABLE "public"."user_group_post_logs" VALIDATE CONSTRAINT "user_group_post_logs_post_id_fkey";
ALTER TABLE "public"."user_group_post_logs" VALIDATE CONSTRAINT "user_group_post_logs_group_id_fkey";

-- Grant permissions (anon not needed - workspace data is private)
GRANT DELETE ON TABLE "public"."user_group_post_logs" TO "authenticated";
GRANT INSERT ON TABLE "public"."user_group_post_logs" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."user_group_post_logs" TO "authenticated";
GRANT SELECT ON TABLE "public"."user_group_post_logs" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."user_group_post_logs" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."user_group_post_logs" TO "authenticated";
GRANT UPDATE ON TABLE "public"."user_group_post_logs" TO "authenticated";

GRANT DELETE ON TABLE "public"."user_group_post_logs" TO "service_role";
GRANT INSERT ON TABLE "public"."user_group_post_logs" TO "service_role";
GRANT REFERENCES ON TABLE "public"."user_group_post_logs" TO "service_role";
GRANT SELECT ON TABLE "public"."user_group_post_logs" TO "service_role";
GRANT TRIGGER ON TABLE "public"."user_group_post_logs" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."user_group_post_logs" TO "service_role";
GRANT UPDATE ON TABLE "public"."user_group_post_logs" TO "service_role";

-- Create function to log post changes
CREATE OR REPLACE FUNCTION public.log_post_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO user_group_post_logs (
        post_id,
        group_id,
        title,
        content,
        notes,
        created_at,
        post_approval_status,
        approved_by,
        approved_at,
        rejected_by,
        rejected_at,
        rejection_reason
    )
    VALUES (
        NEW.id,
        NEW.group_id,
        NEW.title,
        NEW.content,
        NEW.notes,
        now(),
        NEW.post_approval_status,
        NEW.approved_by,
        NEW.approved_at,
        NEW.rejected_by,
        NEW.rejected_at,
        NEW.rejection_reason
    );
    
    RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_post_change_log ON public.user_group_posts;

-- Create trigger to log post changes only after approval
CREATE TRIGGER trg_post_change_log
    AFTER UPDATE ON public.user_group_posts
    FOR EACH ROW
    WHEN (NEW.post_approval_status = 'APPROVED')
    EXECUTE FUNCTION public.log_post_change();

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow view post logs" ON "public"."user_group_post_logs";
DROP POLICY IF EXISTS "Allow create post logs" ON "public"."user_group_post_logs";
DROP POLICY IF EXISTS "Allow update post logs" ON "public"."user_group_post_logs";
DROP POLICY IF EXISTS "Allow delete post logs" ON "public"."user_group_post_logs";

-- VIEW policy: users with view_user_groups_posts permission can SELECT
CREATE POLICY "Allow view post logs"
ON "public"."user_group_post_logs"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  public.has_workspace_permission(
    (SELECT wug.ws_id FROM workspace_user_groups wug WHERE wug.id = user_group_post_logs.group_id),
    auth.uid(),
    'view_user_groups_posts'
  )
);

-- CREATE policy: users with create_user_groups_posts permission can INSERT
CREATE POLICY "Allow create post logs"
ON "public"."user_group_post_logs"
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_workspace_permission(
    (SELECT wug.ws_id FROM workspace_user_groups wug WHERE wug.id = user_group_post_logs.group_id),
    auth.uid(),
    'create_user_groups_posts'
  )
);

-- UPDATE policy: users with update_user_groups_posts permission can UPDATE
CREATE POLICY "Allow update post logs"
ON "public"."user_group_post_logs"
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  public.has_workspace_permission(
    (SELECT wug.ws_id FROM workspace_user_groups wug WHERE wug.id = user_group_post_logs.group_id),
    auth.uid(),
    'update_user_groups_posts'
  )
)
WITH CHECK (
  public.has_workspace_permission(
    (SELECT wug.ws_id FROM workspace_user_groups wug WHERE wug.id = user_group_post_logs.group_id),
    auth.uid(),
    'update_user_groups_posts'
  )
);

-- DELETE policy: users with delete_user_groups_posts permission can DELETE
CREATE POLICY "Allow delete post logs"
ON "public"."user_group_post_logs"
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
  public.has_workspace_permission(
    (SELECT wug.ws_id FROM workspace_user_groups wug WHERE wug.id = user_group_post_logs.group_id),
    auth.uid(),
    'delete_user_groups_posts'
  )
);

-- Add comments
COMMENT ON TABLE public.user_group_post_logs IS 'Logs table for tracking post snapshots and approval history for comparison purposes';
COMMENT ON FUNCTION public.log_post_change() IS 'Trigger function that logs post changes to the logs table when posts are approved';
