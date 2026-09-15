import 'server-only';
import { handleTaskRoutePOST } from '@tuturuuu/tasks-api/server/tasks/route';
import { NextRequest } from 'next/server';
import type { buildFollowupPayload } from '../followup-save';
import { MeetAiError } from './access';
import type { followupAccess } from './followup-context';

/** Reuse Tasks' actor-aware creation, relations, quotas, sorting and rich-text handling. */
export async function prepareTaskFollowup(
  access: Awaited<ReturnType<typeof followupAccess>>,
  boardId: string,
  payload: Extract<ReturnType<typeof buildFollowupPayload>, { listId: string }>
) {
  const [board, list, members] = await Promise.all([
    access.db
      .from('workspace_boards')
      .select('id')
      .eq('id', boardId)
      .eq('ws_id', access.workspaceId)
      .is('archived_at', null)
      .is('deleted_at', null)
      .maybeSingle(),
    access.db
      .from('task_lists')
      .select('id')
      .eq('id', payload.listId)
      .eq('board_id', boardId)
      .eq('deleted', false)
      .eq('archived', false)
      .maybeSingle(),
    access.db
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', access.workspaceId)
      .eq('type', 'MEMBER')
      .in('user_id', payload.assignee_ids),
  ]);
  if (board.error || list.error || members.error)
    throw new MeetAiError(503, 'Task destination unavailable');
  if (!board.data || !list.data)
    throw new MeetAiError(400, 'Choose an active board and list');
  const eligible = new Set(members.data.map((member) => member.user_id));
  if (payload.assignee_ids.some((id) => !eligible.has(id)))
    throw new MeetAiError(400, 'Assignee is no longer a workspace member');
  const body = {
    ...payload,
    description: JSON.stringify({
      type: 'doc',
      content: payload.description.split('\n').map((text) => ({
        type: 'paragraph',
        ...(text ? { content: [{ type: 'text', text }] } : {}),
      })),
    }),
  };
  return async () => {
    const response = await handleTaskRoutePOST(
      new NextRequest('https://meet.tuturuuu.com/internal/task-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ wsId: access.workspaceId }) },
      { appSession: true, supabase: access.db, user: access.user }
    );
    // A failure can occur after insertion. Keep the receipt pending unless success is confirmed.
    if (!response.ok) return { error: 'Task save could not be confirmed' };
    return response.json();
  };
}
