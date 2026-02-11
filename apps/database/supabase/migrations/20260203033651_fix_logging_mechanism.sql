-- Create helper function to map auth.uid() to workspace_users.id
CREATE OR REPLACE FUNCTION public.get_workspace_user_id(p_user_id uuid, p_ws_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_workspace_user_id uuid;
BEGIN
    SELECT virtual_user_id INTO v_workspace_user_id
    FROM public.workspace_user_linked_users
    WHERE platform_user_id = p_user_id AND ws_id = p_ws_id;
    
    RETURN v_workspace_user_id;
END;
$$;

-- Add creator_id to user_group_posts and user_group_post_logs
ALTER TABLE public.user_group_posts ADD COLUMN IF NOT EXISTS creator_id uuid;
ALTER TABLE public.user_group_post_logs ADD COLUMN IF NOT EXISTS creator_id uuid;

-- Clean up invalid creator_ids that would violate FK constraints
UPDATE public.user_group_posts SET creator_id = NULL WHERE creator_id NOT IN (SELECT id FROM workspace_users);
UPDATE public.user_group_post_logs SET creator_id = NULL WHERE creator_id NOT IN (SELECT id FROM workspace_users);

-- Add foreign key constraints for creator_id
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_group_posts_creator_id_fkey') THEN
        ALTER TABLE public.user_group_posts 
            ADD CONSTRAINT user_group_posts_creator_id_fkey 
            FOREIGN KEY (creator_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_group_post_logs_creator_id_fkey') THEN
        ALTER TABLE public.user_group_post_logs 
            ADD CONSTRAINT user_group_post_logs_creator_id_fkey 
            FOREIGN KEY (creator_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
END $$;

-- Backfill creator_id for existing posts
UPDATE public.user_group_posts SET creator_id = approved_by WHERE creator_id IS NULL AND approved_by IS NOT NULL;
UPDATE public.user_group_posts 
SET creator_id = (
    SELECT user_id 
    FROM public.workspace_user_groups_users 
    WHERE group_id = public.user_group_posts.group_id 
    AND role = 'TEACHER' 
    LIMIT 1
)
WHERE creator_id IS NULL;

-- Backfill creator_id for existing post logs
UPDATE public.user_group_post_logs SET creator_id = approved_by WHERE creator_id IS NULL AND approved_by IS NOT NULL;

-- Update handle_post_approval to set creator_id on INSERT
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
    IF v_user_id IS NOT NULL THEN
        v_workspace_user_id := get_workspace_user_id(v_user_id, v_ws_id);
    END IF;
    
    -- Set creator_id for new posts
    IF TG_OP = 'INSERT' AND NEW.creator_id IS NULL THEN
        NEW.creator_id := v_workspace_user_id;
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

-- Update log_report_change to correctly attribute modifier
CREATE OR REPLACE FUNCTION public.log_report_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ws_id uuid;
    v_modifier_id uuid;
BEGIN
    SELECT ws_id INTO v_ws_id
    FROM workspace_user_groups
    WHERE id = NEW.group_id;

    IF auth.uid() IS NOT NULL THEN
        v_modifier_id := get_workspace_user_id(auth.uid(), v_ws_id);
    END IF;

    INSERT INTO external_user_monthly_report_logs (
        report_id,
        user_id,
        group_id,
        title,
        content,
        feedback,
        score,
        scores,
        creator_id, -- Used as MODIFIER_ID in logs
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
        COALESCE(v_modifier_id, NEW.creator_id),
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

-- Update log_post_change to correctly attribute modifier
CREATE OR REPLACE FUNCTION public.log_post_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ws_id uuid;
    v_modifier_id uuid;
BEGIN
    SELECT ws_id INTO v_ws_id
    FROM workspace_user_groups
    WHERE id = NEW.group_id;

    IF auth.uid() IS NOT NULL THEN
        v_modifier_id := get_workspace_user_id(auth.uid(), v_ws_id);
    END IF;

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
        rejection_reason,
        creator_id -- Used as MODIFIER_ID in logs
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
        NEW.rejection_reason,
        COALESCE(v_modifier_id, NEW.creator_id)
    );
    
    RETURN NEW;
END;
$$;
