-- Manual rollback only: lets a board's ticket prefix be set to a project key
-- again. Existing prefixes and keys are left as they are.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

drop trigger if exists guard_board_ticket_prefix_project_key on public.workspace_boards;
drop function if exists private.guard_board_ticket_prefix_project_key();

COMMIT;
