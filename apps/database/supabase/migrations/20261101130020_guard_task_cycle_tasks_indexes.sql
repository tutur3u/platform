-- IF NOT EXISTS can skip an INVALID index left by a failed concurrent build,
-- and 20261101130010 is recorded once it runs, so it never reruns. Stop here
-- until the cycle_id lookup index is valid. One cycle per task is enforced by
-- public.assign_task_cycle() (20261101130030), not by an index.
-- tuturuuu: reviewed(dynamic-sql-review): fixed catalog checks only; no EXECUTE or interpolated SQL.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_index
    where indexrelid = pg_catalog.to_regclass(
      'public.idx_task_cycle_tasks_cycle_id'
    )
      and indrelid = 'public.task_cycle_tasks'::pg_catalog.regclass
      and indisvalid
      and indisready
  ) then
    raise exception using
      errcode = '55000',
      message = 'Task cycle cycle_id index is missing or invalid',
      hint = 'Drop an invalid index concurrently outside a transaction, rebuild it with psql -f apps/database/supabase/migrations/20261101130010_index_task_cycle_tasks_cycle_id.sql in autocommit, then retry pending migrations.';
  end if;
end;
$$;
