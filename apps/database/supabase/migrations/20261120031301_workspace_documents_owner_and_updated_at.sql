-- Record who created a document and when it was last edited.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.workspace_documents
  add column if not exists updated_at timestamptz;

update public.workspace_documents
set updated_at = created_at
where updated_at is null;

alter table public.workspace_documents
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.workspace_documents
  add column if not exists owner_id uuid references public.users (id) on delete set null;

create index if not exists workspace_documents_owner_id_idx
  on public.workspace_documents (owner_id);

create function private.workspace_documents_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspace_documents_touch_updated_at
  on public.workspace_documents;

create trigger workspace_documents_touch_updated_at
  before update on public.workspace_documents
  for each row
  execute function private.workspace_documents_touch_updated_at();

revoke all on function private.workspace_documents_touch_updated_at()
  from public, anon, authenticated;
