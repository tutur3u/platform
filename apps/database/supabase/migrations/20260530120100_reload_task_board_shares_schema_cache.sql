-- Ensure PostgREST can see task_board_shares immediately after the table
-- migration is applied.
notify pgrst, 'reload schema';
