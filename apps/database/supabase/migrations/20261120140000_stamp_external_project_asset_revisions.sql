create function private.stamp_external_project_asset_revision()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function private.stamp_external_project_asset_revision() from public, anon, authenticated;

drop trigger workspace_external_project_assets_updated_at on public.workspace_external_project_assets;
create trigger workspace_external_project_assets_updated_at
  before insert or update on public.workspace_external_project_assets
  for each row execute function private.stamp_external_project_asset_revision();
