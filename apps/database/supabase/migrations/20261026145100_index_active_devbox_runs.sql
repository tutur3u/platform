create index concurrently if not exists idx_devbox_runs_active_updated
    on private.devbox_runs(updated_at)
    where status in ('running', 'cancel_requested');
