-- First, identify duplicate emails by creating a temp table to store them
CREATE TEMP TABLE duplicate_nova_roles AS
SELECT email
FROM public.nova_roles
WHERE email IS NOT NULL
GROUP BY email
HAVING COUNT(*) > 1;

-- For each duplicate email, keep only the most recently created record
WITH ranked_roles AS (
  SELECT 
    id,
    email,
    ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at DESC) as row_num
  FROM public.nova_roles
  WHERE email IN (SELECT email FROM duplicate_nova_roles)
)
DELETE FROM public.nova_roles
WHERE id IN (
  SELECT id 
  FROM ranked_roles 
  WHERE row_num > 1
);

-- Remove any NULL email values
DELETE FROM public.nova_roles WHERE email IS NULL;

-- Add a unique constraint to the email column
ALTER TABLE public.nova_roles 
  ALTER COLUMN email SET NOT NULL,
  ADD CONSTRAINT nova_roles_email_unique UNIQUE (email);

-- Drop the temporary table
DROP TABLE duplicate_nova_roles;

-- Make sure "null" enabled is false
UPDATE public.nova_roles
SET enabled = false
WHERE enabled IS NULL;

-- Make sure "null" allow_challenge_management is false
UPDATE public.nova_roles
SET allow_challenge_management = false
WHERE allow_challenge_management IS NULL;

-- Make sure "null" allow_role_management is false
UPDATE public.nova_roles
SET allow_role_management = false
WHERE allow_role_management IS NULL;

alter table "public"."nova_roles" alter column "allow_challenge_management" set not null;

alter table "public"."nova_roles" alter column "allow_role_management" set not null;

alter table "public"."nova_roles" alter column "enabled" set not null;