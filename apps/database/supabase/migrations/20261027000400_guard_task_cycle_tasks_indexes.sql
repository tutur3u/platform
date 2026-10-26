-- IF NOT EXISTS can skip an INVALID index left by a failed concurrent build.
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
      and indisunique
  ) then
    raise exception using
      errcode = '55000',
      message = 'Task cycle one-cycle-per-task unique index is missing or invalid',
      hint = 'Audit duplicates with apps/database/verification/task-cycle-duplicate-links.sql, resolve them with release-authority approval, drop the invalid index concurrently outside a transaction, then retry pending migrations.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index
    where indexrelid = pg_catalog.to_regclass(
      'public.idx_task_cycle_tasks_cycle_id'
    )
      and indrelid = 'public.task_cycle_tasks'::pg_catalog.regclass
      and indisvalid
  ) then
    raise exception using
      errcode = '55000',
      message = 'Task cycle cycle_id index is missing or invalid',
      hint = 'Drop the invalid index concurrently outside a transaction, then retry pending migrations.';
  end if;
end;
$$;
