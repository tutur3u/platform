-- owner_id is assigned here, not by the client. Authenticated and anonymous
-- sessions always store auth.uid(). service_role may set the creator on insert.
-- A later change is rejected. ON DELETE SET NULL still clears the column,
-- because that update is nested under the users delete and writes null.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function private.workspace_documents_assign_owner()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') then
      new.owner_id := auth.uid();
    end if;
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id then
    if pg_trigger_depth() > 1 and new.owner_id is null then
      return new;
    end if;
    raise exception 'owner_id cannot be changed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_documents_assign_owner
  on public.workspace_documents;

create trigger workspace_documents_assign_owner
  before insert or update of owner_id on public.workspace_documents
  for each row
  execute function private.workspace_documents_assign_owner();

revoke all on function private.workspace_documents_assign_owner()
  from public, anon, authenticated;
