grant usage on schema private to service_role;

grant select, insert, update, delete on table
    private.devbox_artifacts,
    private.devbox_cache_evictions,
    private.devbox_cache_records,
    private.devbox_env_revisions,
    private.devbox_leases,
    private.devbox_preview_requests,
    private.devbox_run_events,
    private.devbox_runner_tokens,
    private.devbox_runners,
    private.devbox_runs,
    private.devbox_sync_artifacts
to service_role;
