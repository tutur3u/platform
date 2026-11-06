import type { TypedSupabaseClient } from '@tuturuuu/supabase';

type ReferenceError = { message: string; status: 400 | 500 };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A time tracking request's `task_id` is copied onto the session created when
 * the request is approved, so it must belong to the request's workspace
 * (task -> list -> board -> `ws_id`).
 */
export async function validateRequestTask({
  client,
  taskId,
  wsId,
}: {
  client: TypedSupabaseClient;
  taskId: string | null | undefined;
  wsId: string;
}): Promise<ReferenceError | null> {
  if (!taskId) return null;
  if (!UUID_PATTERN.test(taskId))
    return { message: 'Invalid task', status: 400 };
  const { data, error } = await client
    .from('tasks')
    .select('id, task_lists!inner(workspace_boards!inner(ws_id))')
    .eq('id', taskId)
    .maybeSingle();
  if (error) return { message: 'Failed to validate task', status: 500 };
  if (!data || data.task_lists?.workspace_boards?.ws_id !== wsId)
    return { message: 'Invalid task', status: 400 };
  return null;
}

/**
 * A time tracking request's `category_id` is copied onto the session created
 * when the request is approved, so it must belong to the request's workspace.
 */
export async function validateRequestCategory({
  categoryId,
  client,
  wsId,
}: {
  categoryId: string | null | undefined;
  client: TypedSupabaseClient;
  wsId: string;
}): Promise<ReferenceError | null> {
  if (!categoryId) return null;
  if (!UUID_PATTERN.test(categoryId))
    return { message: 'Invalid category', status: 400 };
  const { data, error } = await client
    .from('time_tracking_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('ws_id', wsId)
    .maybeSingle();
  if (error) return { message: 'Failed to validate category', status: 500 };
  if (!data) return { message: 'Invalid category', status: 400 };
  return null;
}

/** Validates both request references; the first failure wins. */
export async function validateRequestReferences(input: {
  categoryId: string | null | undefined;
  client: TypedSupabaseClient;
  taskId: string | null | undefined;
  wsId: string;
}): Promise<ReferenceError | null> {
  return (
    (await validateRequestTask(input)) ?? (await validateRequestCategory(input))
  );
}
