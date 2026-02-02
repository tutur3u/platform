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
ALTER TABLE "public"."user_group_post_logs" ADD CONSTRAINT "user_group_post_logs_pkey" PRIMARY KEY USING INDEX "user_group_post_logs_pkey";

-- Add foreign key constraints (only for core relations)
ALTER TABLE "public"."user_group_post_logs" 
    ADD CONSTRAINT "user_group_post_logs_post_id_fkey" 
    FOREIGN KEY (post_id) REFERENCES user_group_posts(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
ALTER TABLE "public"."user_group_post_logs" VALIDATE CONSTRAINT "user_group_post_logs_post_id_fkey";

ALTER TABLE "public"."user_group_post_logs" 
    ADD CONSTRAINT "user_group_post_logs_group_id_fkey" 
    FOREIGN KEY (group_id) REFERENCES workspace_user_groups(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
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
