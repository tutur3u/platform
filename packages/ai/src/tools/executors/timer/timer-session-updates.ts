import type { MiraToolContext } from '../../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../../workspace-context';
import { hasTaskAccess, hasTimeTrackingCategoryAccess } from '../scope-helpers';
import {
  coerceOptionalString,
  MIN_DURATION_SECONDS,
  parseFlexibleDateTime,
} from './timer-helpers';
import {
  type DeleteTimeTrackingSessionArgs,
  deleteTimeTrackingSessionArgsSchema,
  getZodErrorMessage,
  type UpdateTimeTrackingSessionArgs,
  updateTimeTrackingSessionArgsSchema,
} from './timer-mutation-schemas';
import {
  type DeleteTimeTrackingSessionResult,
  toTimerSession,
  type UpdateTimeTrackingSessionResult,
} from './timer-mutation-types';

export async function executeUpdateTimeTrackingSession(
  args: Record<string, unknown>,
  ctx: MiraToolContext
): Promise<UpdateTimeTrackingSessionResult> {
  let parsedArgs: UpdateTimeTrackingSessionArgs;
  try {
    parsedArgs = updateTimeTrackingSessionArgsSchema.parse(args);
  } catch (error) {
    return { error: getZodErrorMessage(error) };
  }

  const workspaceId = getWorkspaceContextWorkspaceId(ctx);
  const sessionId =
    coerceOptionalString(parsedArgs.sessionId) ??
    coerceOptionalString(parsedArgs.id);
  if (!sessionId) return { error: 'sessionId is required' };

  const { data: existing, error: existingError } = await ctx.supabase
    .from('time_tracking_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('ws_id', workspaceId)
    .eq('user_id', ctx.userId)
    .maybeSingle();

  if (existingError) return { error: existingError.message };
  if (!existing) return { error: 'Session not found' };

  const updates: Record<string, unknown> = {};
  if (parsedArgs.title !== undefined) {
    if (typeof parsedArgs.title !== 'string') {
      return { error: 'title must be a string' };
    }

    const normalizedTitle = parsedArgs.title.trim();
    if (normalizedTitle.length === 0) {
      return { error: 'title cannot be blank' };
    }
    updates.title = normalizedTitle;
  }
  if (parsedArgs.description !== undefined) {
    updates.description = coerceOptionalString(parsedArgs.description);
  }
  if (parsedArgs.categoryId !== undefined) {
    const categoryId = coerceOptionalString(parsedArgs.categoryId);

    if (categoryId) {
      try {
        if (!(await hasTimeTrackingCategoryAccess(ctx, categoryId))) {
          return { error: 'Category not found in current workspace' };
        }
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : 'Category lookup failed',
        };
      }
    }

    updates.category_id = categoryId;
  }
  if (parsedArgs.taskId !== undefined) {
    const taskId = coerceOptionalString(parsedArgs.taskId);

    if (taskId) {
      try {
        if (!(await hasTaskAccess(ctx, taskId))) {
          return { error: 'Task not found in current workspace' };
        }
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Task lookup failed',
        };
      }
    }

    updates.task_id = taskId;
  }

  let nextStartTime = existing.start_time;
  let nextEndTime = existing.end_time;

  if (parsedArgs.startTime !== undefined) {
    const parsed = parseFlexibleDateTime(parsedArgs.startTime, 'startTime', {
      date: parsedArgs.date,
      timezone: ctx.timezone,
    });
    if (!parsed.ok) return { error: parsed.error };
    nextStartTime = parsed.value.toISOString();
    updates.start_time = nextStartTime;
  }

  if (parsedArgs.endTime !== undefined) {
    const parsed = parseFlexibleDateTime(parsedArgs.endTime, 'endTime', {
      date: parsedArgs.date,
      timezone: ctx.timezone,
    });
    if (!parsed.ok) return { error: parsed.error };
    nextEndTime = parsed.value.toISOString();
    updates.end_time = nextEndTime;
  }

  if (parsedArgs.startTime !== undefined || parsedArgs.endTime !== undefined) {
    if (!nextEndTime) {
      return { error: 'Cannot compute duration without endTime' };
    }

    const start = new Date(nextStartTime);
    const end = new Date(nextEndTime);
    if (end <= start) {
      return { error: 'endTime must be after startTime' };
    }

    const durationSeconds = Math.floor(
      (end.getTime() - start.getTime()) / 1000
    );
    if (durationSeconds < MIN_DURATION_SECONDS) {
      return { error: 'Session must be at least 1 minute long' };
    }
    updates.duration_seconds = durationSeconds;
  }

  if (Object.keys(updates).length === 0) {
    return { success: true, message: 'No fields to update' };
  }

  const { data, error } = await ctx.supabase
    .from('time_tracking_sessions')
    .update(updates)
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

  if (error) return { error: error.message };
  return {
    success: true,
    message: 'Session updated',
    session: toTimerSession(data as Record<string, unknown>),
  };
}

export async function executeDeleteTimeTrackingSession(
  args: Record<string, unknown>,
  ctx: MiraToolContext
): Promise<DeleteTimeTrackingSessionResult> {
  let parsedArgs: DeleteTimeTrackingSessionArgs;
  try {
    parsedArgs = deleteTimeTrackingSessionArgsSchema.parse(args);
  } catch (error) {
    return { error: getZodErrorMessage(error) };
  }

  const workspaceId = getWorkspaceContextWorkspaceId(ctx);
  const sessionId =
    coerceOptionalString(parsedArgs.sessionId) ??
    coerceOptionalString(parsedArgs.id);
  if (!sessionId) return { error: 'sessionId is required' };

  const { data, error } = await ctx.supabase
    .from('time_tracking_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('ws_id', workspaceId)
    .eq('user_id', ctx.userId)
    .select('id');

  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Session not found' };
  return { success: true, message: 'Session deleted' };
}
