-- AI chat metadata stores structured streaming parts, tool calls, tool
-- outputs, token usage, and source citations. These payloads are operational
-- chat artifacts, not small UI metadata, so they must not be blocked by the
-- generic 16 KiB public payload guard.

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

do $$
declare
  existing_constraint record;
begin
  for existing_constraint in
    select con.conname
    from pg_constraint con
    join pg_class cls
      on cls.oid = con.conrelid
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relname = 'ai_chat_messages'
      and con.contype = 'c'
      and (
        con.conname = any (array[
          'metadata_payload_size_check',
          'ai_chat_messages_metadata_payload_size_check',
          'metadata_strict_payload_size_check',
          'ai_chat_messages_metadata_strict_payload_size_check'
        ])
        or position(
          format('octet_length((%I)::text)', 'metadata')
          in pg_get_constraintdef(con.oid)
        ) > 0
        or position(
          format('octet_length(%I::text)', 'metadata')
          in pg_get_constraintdef(con.oid)
        ) > 0
      )
  loop
    execute format(
      'alter table public.ai_chat_messages drop constraint if exists %I',
      existing_constraint.conname
    );
  end loop;
end;
$$;
