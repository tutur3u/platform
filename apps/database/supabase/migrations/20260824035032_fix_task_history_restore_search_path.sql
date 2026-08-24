-- Restoring a task runs the normal task update trigger chain. Some legacy
-- trigger dependencies still resolve public task tables through search_path.
-- The restore RPC originally forced an empty path, causing otherwise-valid
-- updates to fail with `relation "task_lists" does not exist`.
--
-- Restrict resolution to the application schema so restore behavior matches a
-- normal task update while retaining a deterministic security-definer path.

alter function public.revert_task_to_history(uuid, uuid, uuid, text[])
  set search_path = public;
