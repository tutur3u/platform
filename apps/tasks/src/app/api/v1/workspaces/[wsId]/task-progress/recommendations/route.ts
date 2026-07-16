import { connection, type NextRequest, NextResponse } from 'next/server';
import {
  isTaskProgressSchemaUnavailableError,
  logTaskProgressError,
  resolveTaskProgressRouteAuth,
  type TaskProgressRouteContext,
  taskProgressRouteErrorResponse,
  taskProgressSchemaUnavailableResponse,
} from '../_utils';

interface NextTask {
  id: string;
  name: string;
  priority: number | null;
  end_date: string | null;
  list_name: string | null;
  board_name: string | null;
}

// Open tasks are sorted by due date (soonest first, undated last) then priority.
function sortNextTasks(a: NextTask, b: NextTask) {
  const aDue = a.end_date ? Date.parse(a.end_date) : Number.POSITIVE_INFINITY;
  const bDue = b.end_date ? Date.parse(b.end_date) : Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  return (a.priority ?? 99) - (b.priority ?? 99);
}

export async function GET(
  request: NextRequest,
  context: TaskProgressRouteContext
) {
  await connection();
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const [tasksResult, documentsResult, goalsResult] = await Promise.all([
      (auth.sbAdmin as any).rpc('get_user_tasks_with_relations', {
        p_user_id: auth.user.id,
        p_ws_id: auth.wsId,
        p_include_deleted: false,
        p_list_statuses: ['not_started', 'active'],
        p_exclude_personally_completed: true,
        p_exclude_personally_unassigned: false,
      }),
      (auth.sbAdmin as any)
        .from('workspace_documents')
        .select('id, name, created_at')
        .eq('ws_id', auth.wsId)
        .order('created_at', { ascending: false })
        .limit(4),
      (auth.sbAdmin as any)
        .from('task_progress_goals')
        .select('id', { count: 'exact', head: true })
        .eq('ws_id', auth.wsId)
        .eq('owner_id', auth.user.id)
        .eq('status', 'active'),
    ]);

    // Task RPC is optional infrastructure — degrade to an empty list on error.
    const nextTasks: NextTask[] = (
      tasksResult?.error ? [] : (tasksResult?.data ?? [])
    )
      .filter(
        (row: Record<string, any>) =>
          !row.task_completed_at && !row.task_closed_at && !row.task_deleted_at
      )
      .map((row: Record<string, any>) => ({
        id: String(row.task_id),
        name: String(row.task_name ?? ''),
        priority: row.task_priority ?? null,
        end_date: row.task_end_date ?? null,
        list_name: row.list_name ?? null,
        board_name: row.board_name ?? null,
      }))
      .sort(sortNextTasks)
      .slice(0, 5);

    const documents = documentsResult?.error
      ? []
      : (documentsResult?.data ?? []).map((doc: Record<string, any>) => ({
          id: String(doc.id),
          name: String(doc.name ?? 'Untitled'),
          created_at: doc.created_at ?? null,
        }));

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      nextTasks,
      documents,
      activeGoals: Number(goalsResult?.count ?? 0),
    });
  } catch (error) {
    if (isTaskProgressSchemaUnavailableError(error)) {
      return taskProgressSchemaUnavailableResponse({
        nextTasks: [],
        documents: [],
        activeGoals: 0,
      });
    }
    logTaskProgressError('Failed to load task progress recommendations', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to load task progress recommendations'
    );
  }
}
