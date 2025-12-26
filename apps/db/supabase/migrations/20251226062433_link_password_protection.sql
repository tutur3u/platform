-- Add password protection columns to shortened_links table
-- password_hash: bcrypt-hashed password (nullable - null means no protection)
-- password_hint: Optional hint for password (plaintext, user-provided)

ALTER TABLE "public"."shortened_links" 
  ADD COLUMN IF NOT EXISTS "password_hash" text,
  ADD COLUMN IF NOT EXISTS "password_hint" text;

-- Create index for efficient filtering of password-protected links
CREATE INDEX IF NOT EXISTS shortened_links_is_password_protected_idx 
  ON public.shortened_links USING btree ((password_hash IS NOT NULL));

-- Add constraint to limit password_hint length
ALTER TABLE "public"."shortened_links" 
  ADD CONSTRAINT "shortened_links_password_hint_length" 
  CHECK (password_hint IS NULL OR char_length(password_hint) <= 200);

-- Comment on columns for documentation
COMMENT ON COLUMN "public"."shortened_links"."password_hash" IS 'bcrypt-hashed password for link protection. NULL means no password protection.';
COMMENT ON COLUMN "public"."shortened_links"."password_hint" IS 'Optional plaintext hint to help users remember the password. Max 200 characters.';
