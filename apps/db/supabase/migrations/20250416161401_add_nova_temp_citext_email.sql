create extension if not exists "citext" with schema "extensions";

-- Create a temporary citext column
ALTER TABLE public.nova_roles 
ADD COLUMN email_citext citext;

-- Copy data from text column to citext column
UPDATE public.nova_roles
SET email_citext = email::citext;

-- Add unique constraint to new column
ALTER TABLE public.nova_roles
ADD CONSTRAINT nova_roles_email_citext_unique UNIQUE (email_citext);

ALTER TABLE public.nova_roles
RENAME COLUMN email TO legacy_email;

ALTER TABLE public.nova_roles
RENAME COLUMN email_citext TO email;

ALTER TABLE public.nova_roles
ALTER COLUMN legacy_email DROP NOT NULL;