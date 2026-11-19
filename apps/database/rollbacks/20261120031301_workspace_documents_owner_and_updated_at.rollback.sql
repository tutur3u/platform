drop trigger if exists workspace_documents_touch_updated_at
  on public.workspace_documents;
drop function if exists private.workspace_documents_touch_updated_at();
drop function if exists public.workspace_documents_touch_updated_at();
drop index if exists public.workspace_documents_owner_id_idx;
alter table public.workspace_documents drop column if exists owner_id;
alter table public.workspace_documents drop column if exists updated_at;
