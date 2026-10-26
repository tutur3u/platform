do $$
begin
    if not exists (
        select 1
        from pg_catalog.pg_index
        where indexrelid = pg_catalog.to_regclass(
            'private.idx_devbox_runs_active_updated'
        )
            and indrelid = 'private.devbox_runs'::regclass
            and indisvalid
            and indisready
    ) then
        raise exception using
            errcode = '55000',
            message = 'Active devbox runs index is missing or invalid',
            hint = 'Drop an invalid index concurrently outside a transaction, rebuild it with 20261026145100_index_active_devbox_runs.sql, then retry pending migrations. See the remote devboxes runbook.';
    end if;
end;
$$;
