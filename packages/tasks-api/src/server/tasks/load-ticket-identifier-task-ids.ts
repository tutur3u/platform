import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

/** Resolve exact identifier candidates before pagination in personal-placement queries.
 * Call only after admitting the requested workspace. The caller still applies
 * board, assignment, placement and source-workspace visibility checks to each ID.
 */
export async function loadTicketIdentifierTaskIds(
  client: TypedSupabaseClient,
  userId: string,
  workspaceId: string,
  identifier: { displayNumber: number; ticketPrefix: string }
): Promise<string[]> {
  const { data: memberships, error } = await client
    .from('workspace_members')
    .select('ws_id')
    .eq('user_id', userId)
    .eq('type', 'MEMBER');
  if (error)
    throw new Error('TICKET_MEMBERSHIP_LOOKUP_FAILED', { cause: error });
  const workspaceIds = [
    ...new Set([workspaceId, ...(memberships ?? []).map((row) => row.ws_id)]),
  ];
  const ids = new Set<string>();
  // Chunk tenant filters and page candidates: PostgREST's row cap must not hide matches.
  for (let index = 0; index < workspaceIds.length; index += 100) {
    const chunk = workspaceIds.slice(index, index + 100);
    for (const kind of ['project', 'board'] as const) {
      for (let offset = 0; ; offset += 200) {
        const query =
          kind === 'project'
            ? client
                .from('task_project_tasks')
                .select(
                  'task_id, project:task_projects!inner(ws_id, ticket_key)'
                )
                .eq('ticket_number', identifier.displayNumber)
                .eq('project.ticket_key', identifier.ticketPrefix)
                .in('project.ws_id', chunk)
                .order('task_id')
            : client
                .from('tasks')
                .select(
                  'id, list:task_lists!inner(board:workspace_boards!inner(ws_id, ticket_prefix))'
                )
                .eq('display_number', identifier.displayNumber)
                .eq('list.board.ticket_prefix', identifier.ticketPrefix)
                .in('list.board.ws_id', chunk)
                .order('id');
        const { data, error: lookupError } = await query.range(
          offset,
          offset + 199
        );
        if (lookupError)
          throw new Error('TICKET_IDENTIFIER_LOOKUP_FAILED', {
            cause: lookupError,
          });
        for (const row of data ?? []) {
          const id = 'task_id' in row ? row.task_id : row.id;
          if (id) ids.add(id);
        }
        if (!data || data.length < 200) break;
      }
    }
  }
  return [...ids];
}
