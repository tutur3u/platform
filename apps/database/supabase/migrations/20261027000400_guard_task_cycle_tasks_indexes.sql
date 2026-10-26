-- IF NOT EXISTS can skip an INVALID index left by a failed concurrent build,
-- and 20261027000200/000300 are recorded once they run, so they never rerun.
-- Do not advance past this point without enforced one-cycle-per-task.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_index
    where indexrelid = pg_catalog.to_regclass(
      'public.idx_task_cycle_tasks_task_id_unique'
    )
      and indrelid = 'public.task_cycle_tasks'::pg_catalog.regclass
      and indisvalid
      and indisready
      and indisunique
  ) then
    raise exception using
      errcode = '55000',
      message = 'Task cycle one-cycle-per-task unique index is missing or invalid',
      hint = 'Resolve duplicate task_id rows first (audit: apps/database/verification/task-cycle-duplicate-links.sql; cleanup needs release-authority approval). Drop an invalid index concurrently outside a transaction, rebuild it with psql -f apps/database/supabase/migrations/20261027000200_index_task_cycle_tasks_one_cycle_per_task.sql in autocommit, then retry pending migrations.';
  end if;

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
      hint = 'Drop an invalid index concurrently outside a transaction, rebuild it with psql -f apps/database/supabase/migrations/20261027000300_index_task_cycle_tasks_cycle_id.sql in autocommit, then retry pending migrations.';
  end if;
end;
$$;
