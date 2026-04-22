import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import type { MiraToolContext } from '../../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../../workspace-context';
import { coerceOptionalString } from './timer-helpers';
import {
  getZodErrorMessage,
  type MoveTimeTrackingSessionArgs,
  moveTimeTrackingSessionArgsSchema,
} from './timer-mutation-schemas';
import {
  type MoveTimeTrackingSessionResult,
  toTimerSession,
} from './timer-mutation-types';

export async function executeMoveTimeTrackingSession(
  args: Record<string, unknown>,
  ctx: MiraToolContext
): Promise<MoveTimeTrackingSessionResult> {
  let parsedArgs: MoveTimeTrackingSessionArgs;
  try {
    parsedArgs = moveTimeTrackingSessionArgsSchema.parse(args);
  } catch (error) {
    return { error: getZodErrorMessage(error) };
  }

  const workspaceId = getWorkspaceContextWorkspaceId(ctx);
  const sessionId =
    coerceOptionalString(parsedArgs.sessionId) ??
    coerceOptionalString(parsedArgs.id);
  const targetWorkspaceId = coerceOptionalString(parsedArgs.targetWorkspaceId);

  if (!sessionId) return { error: 'sessionId is required' };
  if (!targetWorkspaceId) return { error: 'targetWorkspaceId is required' };

  const [sourceCheck, targetCheck] = await Promise.all([
    verifyWorkspaceMembershipType({
      wsId: workspaceId,
      userId: ctx.userId,
      supabase: ctx.supabase,
      requiredType: 'MEMBER',
    }),
    verifyWorkspaceMembershipType({
      wsId: targetWorkspaceId,
      userId: ctx.userId,
      supabase: ctx.supabase,
      requiredType: 'MEMBER',
    }),
  ]);

  if (
    sourceCheck.error === 'membership_lookup_failed' ||
    targetCheck.error === 'membership_lookup_failed'
  ) {
    return { error: 'Could not verify workspace access' };
  }

  if (!sourceCheck.ok) {
    return { error: 'Source workspace access denied' };
  }

  if (!targetCheck.ok) {
    return { error: 'Target workspace access denied' };
  }

  const { data: session, error: sessionError } = await ctx.supabase
    .from('time_tracking_sessions')
    .select(
      `
      *,
      category:time_tracking_categories(id, name),
      task:tasks(id, name)
    `
    )
    .eq('id', sessionId)
    .eq('ws_id', workspaceId)
    .eq('user_id', ctx.userId)
    .maybeSingle();

  if (sessionError) return { error: sessionError.message };
  if (!session) return { error: 'Session not found' };
  if (session.is_running) {
    return {
      error: 'Cannot move running sessions. Please stop the session first.',
    };
  }

  let targetCategoryId: string | null = null;
  if (session.category?.name) {
    const { data: targetCategory, error: targetCategoryError } =
      await ctx.supabase
        .from('time_tracking_categories')
        .select('id')
        .eq('ws_id', targetWorkspaceId)
        .eq('name', session.category.name)
        .limit(1)
        .maybeSingle();

    if (targetCategoryError) {
      return {
        error: `Failed to resolve matching category in target workspace: ${targetCategoryError.message}`,
      };
    }

    targetCategoryId = targetCategory?.id ?? null;
  }

  let targetTaskId: string | null = null;
  if (session.task?.name) {
    const { data: targetTask, error: targetTaskError } = await ctx.supabase
      .from('tasks')
      .select('id, list:task_lists!inner(board:workspace_boards!inner(ws_id))')
      .eq('list.board.ws_id', targetWorkspaceId)
      .eq('name', session.task.name)
      .limit(1)
      .maybeSingle();

    if (targetTaskError) {
      return {
        error: `Failed to resolve matching task in target workspace: ${targetTaskError.message}`,
      };
    }

    targetTaskId = targetTask?.id ?? null;
  }

  const { data: movedSession, error: moveError } = await ctx.supabase
    .from('time_tracking_sessions')
    .update({
      ws_id: targetWorkspaceId,
      category_id: targetCategoryId,
      task_id: targetTaskId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('ws_id', workspaceId)
    .eq('user_id', ctx.userId)
    .select(
      `
      *,
      category:time_tracking_categories(*),
      task:tasks(*)
    `
    )
    .single();

  if (moveError) return { error: moveError.message };

  return {
    success: true,
    message: 'Session moved successfully',
    session: toTimerSession(movedSession as Record<string, unknown>),
  };
}
