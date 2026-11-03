-- Keep this as the only statement: Supabase runs it outside its transaction batch.
-- The primary key leads with task_id, so cycle views need their own index.
-- Plain non-unique index: its build cannot fail on existing row contents.
create index concurrently if not exists idx_task_cycle_tasks_cycle_id
  on public.task_cycle_tasks (cycle_id);
