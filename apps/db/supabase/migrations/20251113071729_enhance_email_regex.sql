-- Update email validation constraint to require TLD (at least one dot in domain)
-- Changes * to + to match stricter client/API validation
-- This ensures emails like sam@tuturuu are rejected (no TLD)

-- Drop existing constraint
ALTER TABLE public.email_blacklist
DROP CONSTRAINT IF EXISTS email_blacklist_email_format_check;

-- Add updated constraint requiring TLD
ALTER TABLE public.email_blacklist
ADD CONSTRAINT email_blacklist_email_format_check
CHECK (
    entry_type != 'email' OR
    value ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$'
);

