-- Migration: Add email content columns to email_audit table
-- Description: Adds html_content and text_content columns to store email body content for audit viewing

ALTER TABLE public.email_audit
ADD COLUMN html_content TEXT,
ADD COLUMN text_content TEXT;

COMMENT ON COLUMN public.email_audit.html_content IS 'HTML content of the email body';
COMMENT ON COLUMN public.email_audit.text_content IS 'Plain text content of the email body';
