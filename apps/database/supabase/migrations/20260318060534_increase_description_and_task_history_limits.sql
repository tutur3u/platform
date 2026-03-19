-- Increase task description and task_history payload limits
-- 
-- Problem: The previous limits were too restrictive:
-- - tasks.description was limited to 8000 bytes and 2000 characters by legacy CHECK constraints
-- - task_history.new_value/old_value/metadata were limited to 8192 bytes by the enforce_strict_text_field_limits trigger
-- 
-- Solution:
-- 1. Drop legacy restrictive CHECK constraints on tasks.description (the more permissive 400KB limits remain)
-- 2. Replace task_history CHECK constraints with 400KB limits
-- 3. Update strict_payload_field_byte_limit() function to allow 400KB for task_history JSONB columns
--
-- This allows storing large descriptions (~90KB) in tasks while maintaining history tracking

-- Drop overly restrictive legacy constraints on tasks.description
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS description_strict_bytes_check;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS description_strict_length_check;

-- Drop and recreate task_history constraints with higher limits
ALTER TABLE public.task_history DROP CONSTRAINT IF EXISTS new_value_strict_payload_size_check;
ALTER TABLE public.task_history DROP CONSTRAINT IF EXISTS old_value_strict_payload_size_check;
ALTER TABLE public.task_history DROP CONSTRAINT IF EXISTS metadata_strict_payload_size_check;

ALTER TABLE public.task_history DROP CONSTRAINT IF EXISTS task_history_new_value_bytes_check;
ALTER TABLE public.task_history DROP CONSTRAINT IF EXISTS task_history_old_value_bytes_check;
ALTER TABLE public.task_history DROP CONSTRAINT IF EXISTS task_history_metadata_bytes_check;

ALTER TABLE public.task_history 
ADD CONSTRAINT task_history_new_value_bytes_check 
CHECK ((new_value IS NULL) OR (octet_length(new_value::text) <= 400000));

ALTER TABLE public.task_history 
ADD CONSTRAINT task_history_old_value_bytes_check 
CHECK ((old_value IS NULL) OR (octet_length(old_value::text) <= 400000));

ALTER TABLE public.task_history 
ADD CONSTRAINT task_history_metadata_bytes_check 
CHECK ((metadata IS NULL) OR (octet_length(metadata::text) <= 400000));

-- Update trigger function to allow larger payloads for task_history
CREATE OR REPLACE FUNCTION public.strict_payload_field_byte_limit(_table_name text, _column_name text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when lower(_table_name) = 'workspace_whiteboards'
      and lower(_column_name) = 'snapshot' then 65536
    when lower(_table_name) = 'email_audit' and lower(_column_name) like '%content%' then 4194304
    when lower(_table_name) = 'sent_emails' and lower(_column_name) like '%content%' then 4194304
    when lower(_table_name) = 'task_history' and lower(_column_name) in ('new_value', 'old_value', 'metadata') then 409600
    when lower(_column_name) = 'content'
      or lower(_column_name) like '%\_content' escape '\'
      or lower(_column_name) like '%record%'
      or lower(_column_name) like '%snapshot%'
      or lower(_column_name) like '%segments%'
      or lower(_column_name) like '%instruction%'
      or lower(_column_name) like '%settings%'
      or lower(_column_name) like '%theme%'
      or lower(_column_name) like '%session_data%'
      or lower(_column_name) like '%agenda%'
      or lower(_column_name) like '%cells%'
      or lower(_column_name) like '%statuses%'
      then 65536
    when lower(_column_name) like '%metadata%'
      or lower(_column_name) like '%data%'
      or lower(_column_name) like '%json%'
      or lower(_column_name) like '%fields%'
      or lower(_column_name) like '%condition%'
      or lower(_column_name) like '%groups%'
      or lower(_column_name) like '%tags%'
      or lower(_column_name) like '%scores%'
      or lower(_column_name) like '%notification%'
      or lower(_column_name) like '%adjustments%'
      or lower(_column_name) like '%deductions%'
      then 16384
    else 8192
  end;
$function$;
