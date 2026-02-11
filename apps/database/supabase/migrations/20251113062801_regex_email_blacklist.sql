-- Add validation constraints for email_blacklist entry types
-- Ensures email entries match valid email format and domain entries match valid domain format

-- Email validation mirrors packages/utils/src/email/validation.ts::EMAIL_BLACKLIST_REGEX
-- Must match standard email format (local@domain) with valid domain structure
-- Allows alphanumeric, dots, hyphens, underscores, plus signs in local part
-- Domain part must be valid domain format
ALTER TABLE public.email_blacklist
ADD CONSTRAINT email_blacklist_email_format_check
CHECK (
    entry_type != 'email' OR
    value ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$'
);

-- Domain validation mirrors packages/utils/src/email/validation.ts::DOMAIN_BLACKLIST_REGEX
-- Allows alphanumeric, hyphens in labels, separated by dots
-- Each label must start and end with alphanumeric character
-- Top-level domain must be at least 2 characters
ALTER TABLE public.email_blacklist
ADD CONSTRAINT email_blacklist_domain_format_check
CHECK (
    entry_type != 'domain' OR
    value ~ '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'
);

-- Additional constraint: value must not be empty or whitespace-only
ALTER TABLE public.email_blacklist
ADD CONSTRAINT email_blacklist_value_not_empty_check
CHECK (trim(value) != '');

