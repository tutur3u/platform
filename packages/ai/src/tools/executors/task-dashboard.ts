import {
  withForwardedInternalApiAuth,
  withTaskApiBaseUrl,
} from '@tuturuuu/internal-api/client';
import { getUserTaskDashboard } from '@tuturuuu/internal-api/tasks';
import { Effect } from '@tuturuuu/utils/effect';
import type { MiraToolContext } from '../mira-tool-types';
import { getWorkspaceContextWorkspaceId } from '../workspace-context';

export function executeTaskDashboard(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const category = args.category ?? args.status ?? 'all';
  const options = withForwardedInternalApiAuth(
    ctx.requestHeaders!,
    withTaskApiBaseUrl()
  );
  return Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const result = await getUserTaskDashboard(
          {
            wsId: getWorkspaceContextWorkspaceId(ctx),
            isPersonal: ctx.workspaceContext?.personal === true,
          },
          options
        );
        const output: Record<string, unknown> = {
          totalActive: result.totalActiveTasks,
        };
        for (const group of ['overdue', 'today', 'upcoming'] as const) {
          if (category !== 'all' && category !== group) continue;
          output[group] = {
            count: result[group].length,
            hasMore: result[group].length > 30,
            tasks: result[group].slice(0, 30).map((task) => ({
              id: task.id,
              name: task.name,
              priority: task.priority,
              dueDate: task.end_date,
              workspaceId: task.list?.board?.ws_id,
              workspaceName: task.list?.board?.workspaces?.name,
              boardId: task.list?.board?.id,
              boardName: task.list?.board?.name,
              listId: task.list_id,
              listName: task.list?.name,
            })),
          };
        }
        return output;
      },
      catch: (error) =>
        error instanceof Error ? error.message : 'Task feed unavailable',
    }).pipe(
      Effect.catchAll((error) => Effect.succeed({ success: false, error }))
    )
  );
}
