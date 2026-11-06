-- Rollback: restore the prior 64 KiB helper; retain the existing 25 MiB CHECK.
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
