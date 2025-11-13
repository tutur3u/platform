-- Update email validation constraint to require TLD (at least one dot in domain)
-- Pattern kept in sync with packages/utils/src/email/validation.ts::EMAIL_BLACKLIST_REGEX
-- Changes * to + to match stricter client/API validation so emails like sam@tuturuu are rejected

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

