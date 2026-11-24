import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { TaskDetailRouteAuthContext } from '../taskId/access';
import { jsonError, requireTaskScope } from './access';

const REF_COLUMNS =
  'provider, external_url, external_repo, external_number, external_author, external_state, external_state_reason, external_assignees, external_created_at, external_closed_at, external_labels';

/** GET .../tasks/:taskId/external-ref: the imported-issue reference, or null. */
export async function handleTaskExternalRefGET(
  request: NextRequest,
  context: { params: Promise<{ wsId: string; taskId: string }> },
  auth?: TaskDetailRouteAuthContext
) {
  try {
    const scope = await requireTaskScope(request, await context.params, auth);
    if ('error' in scope) return scope.error;

    const { data, error } = await scope.admin
      .schema('private')
      .from('task_external_refs')
      .select(REF_COLUMNS)
      .eq('task_id', scope.taskId)
      .eq('ws_id', scope.wsId)
      .maybeSingle();
    if (error) return jsonError('Failed to load external reference', 500);
    return NextResponse.json({ ref: data ?? null });
  } catch (error) {
    console.error('Error in task external ref GET:', error);
    return jsonError('Internal server error', 500);
  }
}
