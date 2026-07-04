-- Restrict task history insertion helpers to server-owned callers.
-- Trigger/helper functions execute as their definer; direct Supabase RPC calls
-- from browser roles must not be able to forge audit rows or actors.

revoke execute on function public.insert_task_history(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
) from public, anon, authenticated;

revoke execute on function public.insert_task_history(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  uuid
) from public, anon, authenticated;

grant execute on function public.insert_task_history(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
) to service_role;

grant execute on function public.insert_task_history(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  uuid
) to service_role;
