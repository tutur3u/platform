-- Cleanup function to ensure proper migration from nova_roles to platform email/user roles
-- This migration handles any edge cases and ensures data consistency

-- Add an index for performance on email column
CREATE INDEX IF NOT EXISTS idx_platform_email_roles_email ON public.platform_email_roles(email);

-- Add RLS policies for platform_email_roles
ALTER TABLE public.platform_email_roles ENABLE ROW LEVEL SECURITY;

-- Create policy for platform_email_roles
CREATE POLICY "Admin users can manage platform email roles" 
ON public.platform_email_roles
FOR ALL 
TO authenticated
USING (is_nova_role_manager());

-- Create policy for platform_user_roles to allow admins to manage
CREATE POLICY "Admin users can manage platform user roles"
ON public.platform_user_roles
FOR ALL
TO authenticated
USING (is_nova_role_manager());

-- Create policy to allow users to see their own roles
CREATE POLICY "Users can see their own roles"
ON public.platform_user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Function to validate and clean up any inconsistencies
CREATE OR REPLACE FUNCTION public.cleanup_role_inconsistencies()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  migrated_count INT := 0;
BEGIN
  -- Migrate any remaining platform_email_roles to platform_user_roles where users exist
  INSERT INTO public.platform_user_roles (
    user_id,
    enabled,
    allow_challenge_management,
    allow_manage_all_challenges,
    allow_role_management
  )
  SELECT 
    upd.user_id,
    per.enabled,
    per.allow_challenge_management,
    per.allow_manage_all_challenges,
    per.allow_role_management
  FROM 
    public.platform_email_roles per
    JOIN public.user_private_details upd ON per.email = upd.email
  ON CONFLICT (user_id) 
  DO UPDATE SET
    enabled = EXCLUDED.enabled,
    allow_challenge_management = EXCLUDED.allow_challenge_management,
    allow_manage_all_challenges = EXCLUDED.allow_manage_all_challenges,
    allow_role_management = EXCLUDED.allow_role_management;
    
  -- Get the number of affected rows
  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  
  RAISE NOTICE 'Migrated % roles from platform_email_roles to platform_user_roles', migrated_count;
  
  -- Remove the migrated email roles
  DELETE FROM public.platform_email_roles per
  WHERE EXISTS (
    SELECT 1 FROM public.user_private_details upd
    WHERE upd.email = per.email
  );
  
  -- Ensure all users have a platform_user_roles entry
  INSERT INTO public.platform_user_roles (user_id, enabled)
  SELECT u.id, false
  FROM public.users u
  LEFT JOIN public.platform_user_roles pur ON u.id = pur.user_id
  WHERE pur.user_id IS NULL;
END;
$$;

-- Execute the cleanup function
SELECT public.cleanup_role_inconsistencies();

-- Comment out after initial run as we don't need to keep this function
-- DROP FUNCTION public.cleanup_role_inconsistencies();
