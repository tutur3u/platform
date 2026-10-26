-- Keep this as the only statement: Supabase runs it outside its transaction batch.
-- A task belongs to at most one cycle. The build fails (and the guard in
-- 20261027091200 stops the chain) if duplicate task_id rows exist; audit them
-- with apps/database/verification/task-cycle-duplicate-links.sql. No rows are
-- deleted by this migration.
create unique index concurrently if not exists idx_task_cycle_tasks_task_id_unique
  on public.task_cycle_tasks (task_id);
