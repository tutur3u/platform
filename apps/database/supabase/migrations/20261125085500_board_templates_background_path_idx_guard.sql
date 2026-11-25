-- Fails the apply unless the index from 20261125085400 exists and is valid.
-- A failed concurrent build leaves an INVALID index that
-- `create index concurrently if not exists` then skips on a retry. Read-only.
-- tuturuuu: reviewed(dynamic-sql-review): read-only pg_index validity guard; static SQL, no EXECUTE.
do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_index i
     where i.indexrelid = pg_catalog.to_regclass(
             'public.board_templates_ws_id_background_path_idx'
           )
       and i.indrelid = 'public.board_templates'::regclass
       and i.indisvalid
       and i.indisready
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'BOARD_TEMPLATES_BACKGROUND_PATH_INDEX_NOT_VALID',
      hint = 'Run "drop index concurrently if exists public.board_templates_ws_id_background_path_idx;" outside a transaction, then rebuild with the exact statement in 20261125085400. If that version is already recorded in supabase_migrations.schema_migrations, run the statement by hand; db push will not re-run it. Then retry this migration.';
  end if;
end;
$$;
