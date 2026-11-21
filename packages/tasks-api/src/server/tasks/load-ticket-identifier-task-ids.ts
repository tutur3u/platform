import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { TaskBoardAccessMode } from '../board-access';

type TicketIdentifier = { displayNumber: number; ticketPrefix: string };

async function loadBoardTicketPage(
  client: TypedSupabaseClient,
  workspaceIds: string[],
  identifier: TicketIdentifier,
  offset: number
) {
  const result = await client
    .schema('private')
    .rpc('list_board_task_ids_by_ticket_prefix', {
      p_workspace_ids: workspaceIds,
      p_ticket_prefix: identifier.ticketPrefix,
      p_display_number: identifier.displayNumber,
    })
    .order('id')
    .range(offset, offset + 199);

  // The web deploy and database migration have separate rollout gates.
  if (result.error?.code !== 'PGRST202' && result.error?.code !== '42883') {
    return result;
  }

  return client
    .from('tasks')
    .select(
      'id, list:task_lists!inner(board:workspace_boards!inner(ws_id, ticket_prefix))'
    )
    .eq('display_number', identifier.displayNumber)
    .eq('list.board.ticket_prefix', identifier.ticketPrefix)
    .in('list.board.ws_id', workspaceIds)
    .order('id')
    .range(offset, offset + 199);
}

async function loadMemberTicketWorkspaces(
  client: TypedSupabaseClient,
  userId: string,
  workspaceId: string
) {
  const { data: memberships, error } = await client
    .from('workspace_members')
    .select('ws_id')
    .eq('user_id', userId)
    .eq('type', 'MEMBER');
  if (error)
    throw new Error('TICKET_MEMBERSHIP_LOOKUP_FAILED', { cause: error });
  return [
    ...new Set([workspaceId, ...(memberships ?? []).map((row) => row.ws_id)]),
  ];
}

/** The caller applies board, assignment and placement visibility to the candidates. */
export async function loadTicketIdentifierTaskIds(
  client: TypedSupabaseClient,
  userId: string,
  workspaceId: string,
  identifier: TicketIdentifier,
  access: TaskBoardAccessMode = 'member'
): Promise<string[]> {
  const workspaceIds =
    access === 'member'
      ? await loadMemberTicketWorkspaces(client, userId, workspaceId)
      : [workspaceId];
  const kinds =
    access === 'member'
      ? (['project', 'board'] as const)
      : (['board'] as const);
  const ids = new Set<string>();
  // Chunk tenant filters and page candidates: PostgREST's row cap must not hide matches.
  for (let index = 0; index < workspaceIds.length; index += 100) {
    const chunk = workspaceIds.slice(index, index + 100);
    for (const kind of kinds) {
      for (let offset = 0; ; offset += 200) {
        const { data, error: lookupError } =
          kind === 'project'
            ? await client
                .from('task_project_tasks')
                .select(
                  'task_id, project:task_projects!inner(ws_id, ticket_key)'
                )
                .eq('ticket_number', identifier.displayNumber)
                .eq('project.ticket_key', identifier.ticketPrefix)
                .in('project.ws_id', chunk)
                .order('task_id')
                .range(offset, offset + 199)
            : await loadBoardTicketPage(client, chunk, identifier, offset);
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
