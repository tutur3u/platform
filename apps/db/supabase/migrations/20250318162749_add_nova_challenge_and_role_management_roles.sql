-- Add new columns
ALTER TABLE "public"."nova_roles" 
ADD COLUMN "allow_challenge_management" boolean DEFAULT false,
ADD COLUMN "allow_role_management" boolean DEFAULT false;

-- Migrate data: set allow_challenge_management and allow_role_management to true where is_admin is true
UPDATE "public"."nova_roles" 
SET "allow_challenge_management" = "is_admin",
    "allow_role_management" = "is_admin";

-- Create policies for challenge management
CREATE POLICY "Allow challenge management" ON "public"."nova_challenges" 
FOR ALL TO authenticated 
USING (EXISTS (
  SELECT 1 
  FROM nova_roles 
  WHERE 
    (nova_roles.email = auth.email()) 
    AND (nova_roles.allow_challenge_management = true)
));

-- Create policies for role management
CREATE POLICY "Allow role management" ON "public"."nova_roles" 
FOR ALL TO authenticated 
USING (EXISTS (
  SELECT 1 
  FROM nova_roles 
  WHERE 
    (nova_roles.email = auth.email()) 
    AND (nova_roles.allow_role_management = true)
));

-- Update RLS policies for other tables that use is_admin
-- This ensures backward compatibility while also supporting the new fields

-- Create a function to check if a user has admin permissions
CREATE OR REPLACE FUNCTION public.nova_user_has_admin_permission()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM nova_roles
    WHERE 
      (nova_roles.email = auth.email()) AND 
      (
        nova_roles.is_admin = true OR 
        nova_roles.allow_role_management = true OR 
        nova_roles.allow_challenge_management = true
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to check if a user has challenge management permission
CREATE OR REPLACE FUNCTION public.nova_user_can_manage_challenges()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM nova_roles
    WHERE 
      (nova_roles.email = auth.email()) AND 
      (nova_roles.is_admin = true OR nova_roles.allow_challenge_management = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to check if a user has role management permission
CREATE OR REPLACE FUNCTION public.nova_user_can_manage_roles()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM nova_roles
    WHERE 
      (nova_roles.email = auth.email()) AND 
      (nova_roles.is_admin = true OR nova_roles.allow_role_management = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Keep is_admin column for now to ensure backward compatibility
-- We can remove it in a future migration after all code is updated
