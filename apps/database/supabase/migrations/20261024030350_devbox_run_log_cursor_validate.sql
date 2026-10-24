-- Validate the cursor and idempotency constraints added NOT VALID in
-- 20261024030000. VALIDATE takes SHARE UPDATE EXCLUSIVE, which does not block
-- reads or writes. The sequence constraint is validated only once the
-- backfill has numbered every event; otherwise the one-time job validates it.
alter table private.devbox_runs
    validate constraint devbox_runs_idempotency_key_format;

do $$
begin
    if not exists (
        select 1 from private.devbox_run_events where seq is null
    ) then
        alter table private.devbox_run_events
            validate constraint devbox_run_events_seq_present;
    else
        raise notice 'devbox run events still need the sequence backfill job';
    end if;
end;
$$;
