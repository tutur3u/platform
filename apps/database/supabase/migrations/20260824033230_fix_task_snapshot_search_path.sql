-- The snapshot RPCs contain legacy unqualified references to public task
-- tables. Production had their search_path hardened to an empty value, so a
-- restore invoked through the app-session wrapper failed before any mutation
-- with `relation "task_lists" does not exist`.
--
-- Keep the lookup deterministic and restricted to the application schema.
-- A future rewrite can fully qualify every legacy reference and return these
-- functions to an empty search_path.

alter function public.get_task_snapshot_at_history(uuid, uuid, uuid)
  set search_path = public;

alter function public.get_task_relationships_at_snapshot(uuid, uuid, uuid)
  set search_path = public;
