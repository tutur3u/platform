create table private.external_project_asset_publication_proofs (
  id uuid primary key,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  canonical_external_project_id text not null references public.canonical_external_projects(id) on delete restrict,
  entry_id uuid not null references public.workspace_external_project_entries(id) on delete cascade,
  published_at timestamptz not null,
  asset_revisions jsonb not null check (jsonb_typeof(asset_revisions) = 'object')
);

create index external_project_asset_publication_proofs_entry_idx
  on private.external_project_asset_publication_proofs (entry_id);

alter table private.external_project_asset_publication_proofs enable row level security;

revoke all on private.external_project_asset_publication_proofs
  from public, anon, authenticated, service_role;
grant select, insert on private.external_project_asset_publication_proofs to service_role;
