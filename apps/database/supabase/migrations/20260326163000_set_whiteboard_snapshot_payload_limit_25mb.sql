-- Tighten whiteboard snapshot payload limit from 64 MB to 25 MB.
-- Keep function-level and CHECK-constraint enforcement in sync.

create or replace function public.strict_payload_field_byte_limit(
  _table_name text,
  _column_name text
)
returns integer
language sql
immutable
as $function$
  select case
    when lower(_table_name) = 'workspace_whiteboards'
      and lower(_column_name) = 'snapshot' then 26214400
    when lower(_table_name) = 'email_audit' and lower(_column_name) like '%content%' then 4194304
    when lower(_table_name) = 'sent_emails' and lower(_column_name) like '%content%' then 4194304
    when lower(_table_name) = 'task_history' and lower(_column_name) in ('new_value', 'old_value', 'metadata') then 400000
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

alter table public.workspace_whiteboards
  drop constraint if exists snapshot_strict_payload_size_check;

alter table public.workspace_whiteboards
  drop constraint if exists workspace_whiteboards_snapshot_strict_payload_size_check;

alter table public.workspace_whiteboards
  add constraint snapshot_strict_payload_size_check
  check (octet_length((snapshot)::text) <= 26214400) not valid;
