-- Bounded backfill of run events written before 20261024030000.
--
-- Numbers at most 50 000 events here, in 5 000-row calls. It takes no table
-- lock beyond ROW EXCLUSIVE, so concurrent appends continue, except for
-- appends to a run whose chunk is being numbered: those wait on its cursor row
-- until this migration commits. If events remain, run the one-time job in the
-- remote devboxes runbook, which repeats the same function in separate
-- transactions. Readers keep the legacy created_at paging for a run until it
-- is fully numbered.
do $$
declare
    v_rows integer;
    v_total integer := 0;
begin
    loop
        v_rows := private.backfill_devbox_run_event_seq(5000);
        v_total := v_total + v_rows;
        exit when v_rows = 0 or v_total >= 50000;
    end loop;
    raise notice 'numbered % legacy devbox run events', v_total;
end;
$$;
