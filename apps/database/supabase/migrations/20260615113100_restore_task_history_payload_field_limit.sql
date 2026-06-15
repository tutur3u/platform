-- Restore the task_history payload-size exemption in strict_payload_field_byte_limit.
--
-- Problem: 20260318060534_increase_description_and_task_history_limits.sql added an
-- explicit case so task_history.new_value/old_value/metadata allow 409600 bytes
-- (large task descriptions are mirrored into task_history.new_value). A later
-- AI-chat migration (20260529123000_exempt_ai_chat_message_metadata_payload_limit.sql)
-- recreated strict_payload_field_byte_limit and accidentally dropped that case.
-- As a result task_history.new_value/old_value fell back to the 8192-byte default
-- (and metadata to 16384), so the enforce_strict_text_field_limits trigger raised
-- PAYLOAD_FIELD_BYTES_EXCEEDED whenever a ~84KB description was persisted, surfacing
-- as a 500 "Failed to update task description" from update_task_fields_with_actor.
--
-- Fix: recreate the function with the current AI-chat body PLUS the restored
-- task_history exemption. 409600 stays above the 400000-byte task_history_*_bytes_check
-- CHECK constraints, which remain the effective cap. Function-only change; no schema
-- or signature change.

create or replace function public.strict_payload_field_byte_limit(
  _table_name text,
  _column_name text
)
returns integer
language sql
immutable
as $$
  select case
    when lower(_table_name) = 'ai_chat_messages'
      and lower(_column_name) = 'metadata' then 10485760
    when lower(_table_name) = 'workspace_whiteboards'
      and lower(_column_name) = 'snapshot' then 65536
    when lower(_table_name) = 'task_history'
      and lower(_column_name) in ('new_value', 'old_value', 'metadata') then 409600
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
      or lower(_column_name) like '%statuses%' then 65536
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
      or lower(_column_name) like '%deductions%' then 16384
    else 8192
  end;
$$;
