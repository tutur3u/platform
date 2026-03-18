-- Increase email content limits for email_audit and sent_emails
-- This migration drops and recreates the CHECK constraints to match the increased limits
-- previously defined in the trigger function.

-- email_audit: html_content and text_content
alter table public.email_audit drop constraint if exists html_content_strict_length_check;
alter table public.email_audit drop constraint if exists html_content_strict_bytes_check;
alter table public.email_audit drop constraint if exists text_content_strict_length_check;
alter table public.email_audit drop constraint if exists text_content_strict_bytes_check;

alter table public.email_audit add constraint html_content_strict_length_check
  check (char_length(html_content) <= 1048576) not valid;
alter table public.email_audit add constraint html_content_strict_bytes_check
  check (octet_length(html_content) <= 4194304) not valid;

alter table public.email_audit add constraint text_content_strict_length_check
  check (char_length(text_content) <= 1048576) not valid;
alter table public.email_audit add constraint text_content_strict_bytes_check
  check (octet_length(text_content) <= 4194304) not valid;

-- sent_emails: content
alter table public.sent_emails drop constraint if exists content_strict_length_check;
alter table public.sent_emails drop constraint if exists content_strict_bytes_check;

alter table public.sent_emails add constraint content_strict_length_check
  check (char_length(content) <= 1048576) not valid;
alter table public.sent_emails add constraint content_strict_bytes_check
  check (octet_length(content) <= 4194304) not valid;

alter table public.email_audit validate constraint html_content_strict_length_check;
alter table public.email_audit validate constraint html_content_strict_bytes_check;
alter table public.email_audit validate constraint text_content_strict_length_check;
alter table public.email_audit validate constraint text_content_strict_bytes_check;
alter table public.sent_emails validate constraint content_strict_length_check;
alter table public.sent_emails validate constraint content_strict_bytes_check;
