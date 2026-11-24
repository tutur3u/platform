-- Validate the widened task_history change-type check in its own migration so the scan takes SHARE UPDATE EXCLUSIVE and never blocks task writes. Idempotent: validating an already-valid constraint is a no-op.
set lock_timeout = '5s';
set statement_timeout = '10min';
alter table public.task_history validate constraint task_history_change_type_check;
reset statement_timeout;
reset lock_timeout;
