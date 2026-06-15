create or replace function private.enforce_task_description_chunk_storage_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  declared_chunk_count integer;
  declared_total_length integer;
  field_plan jsonb;
  session_fields jsonb;
  stored_length integer;
begin
  select fields
    into session_fields
  from private.task_description_chunk_sessions
  where id = new.session_id
  for update;

  if session_fields is null then
    raise exception 'Task description chunk session not found'
      using errcode = '23503';
  end if;

  field_plan := session_fields -> new.field;

  if field_plan is null or coalesce((field_plan ->> 'is_null')::boolean, false) then
    raise exception 'Task description chunk field is not part of this session'
      using errcode = '23514';
  end if;

  declared_chunk_count := (field_plan ->> 'chunk_count')::integer;
  declared_total_length := (field_plan ->> 'total_length')::integer;

  if declared_chunk_count is null or declared_total_length is null then
    raise exception 'Task description chunk field plan is invalid'
      using errcode = '23514';
  end if;

  if new.chunk_index >= declared_chunk_count then
    raise exception 'Task description chunk index is outside the declared range'
      using errcode = '23514';
  end if;

  select coalesce(sum(char_length(chunk)), 0)
    into stored_length
  from private.task_description_chunks
  where session_id = new.session_id
    and field = new.field
    and chunk_index <> new.chunk_index;

  if stored_length + char_length(new.chunk) > declared_total_length then
    raise exception 'Task description chunks exceed declared field length'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_task_description_chunk_storage_limit
on private.task_description_chunks;

create trigger enforce_task_description_chunk_storage_limit
before insert or update on private.task_description_chunks
for each row execute function private.enforce_task_description_chunk_storage_limit();
