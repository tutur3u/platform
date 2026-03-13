import type { MiraToolContext } from '../../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../../workspace-context';
import { hasTaskAccess, hasTimeTrackingCategoryAccess } from '../scope-helpers';
import {
  coerceOptionalString,
  MIN_DURATION_SECONDS,
  parseFlexibleDateTime,
  shouldRequireApproval,
} from './timer-helpers';
import {
  type CreateTimeTrackingEntryArgs,
  createTimeTrackingEntryArgsSchema,
  getZodErrorMessage,
  type StartTimerArgs,
  type StopTimerArgs,
  startTimerArgsSchema,
  stopTimerArgsSchema,
} from './timer-mutation-schemas';
import {
  type CreateTimeTrackingEntryResult,
  type StartTimerResult,
  type StopTimerResult,
  toTimerSession,
} from './timer-mutation-types';

export async function executeStartTimer(
  args: Record<string, unknown>,
  ctx: MiraToolContext
): Promise<StartTimerResult> {
  let parsedArgs: StartTimerArgs;
  try {
    parsedArgs = startTimerArgsSchema.parse(args);
  } catch (error) {
    return { error: getZodErrorMessage(error) };
  }

  const workspaceId = getWorkspaceContextWorkspaceId(ctx);
  const title = parsedArgs.title;
  const now = new Date();

  const { data: runningSessions, error: runningSelectError } =
    await ctx.supabase
      .from('time_tracking_sessions')
      .select('id, start_time')
      .eq('user_id', ctx.userId)
      .eq('ws_id', workspaceId)
      .eq('is_running', true);

  if (runningSelectError) return { error: runningSelectError.message };

  for (const runningSession of runningSessions ?? []) {
    const runningStartTime = new Date(runningSession.start_time);
    const durationSeconds = Number.isNaN(runningStartTime.getTime())
      ? 0
      : Math.max(
          0,
          Math.floor((now.getTime() - runningStartTime.getTime()) / 1000)
        );

    const { data: stoppedRows, error: stopError } = await ctx.supabase
      .from('time_tracking_sessions')
      .update({
        is_running: false,
        end_time: now.toISOString(),
        duration_seconds: durationSeconds,
      })
      .eq('id', runningSession.id)
      .eq('user_id', ctx.userId)
      .eq('ws_id', workspaceId)
      .eq('is_running', true)
      .select('id');

    if (stopError) {
      return {
        error: `Failed to stop running timer before starting a new one: ${stopError.message}`,
      };
    }

    if (!stoppedRows?.length) {
      return {
        error:
          'Failed to stop running timer before starting a new one: no session was updated',
      };
    }
  }

  const { data: session, error } = await ctx.supabase
    .from('time_tracking_sessions')
    .insert({
      title,
      description: coerceOptionalString(parsedArgs.description),
      start_time: now.toISOString(),
      is_running: true,
      user_id: ctx.userId,
      ws_id: workspaceId,
    })
    .select('id, title, start_time')
    .single();

  if (error) return { error: error.message };
  return {
    success: true,
    message: `Timer started: "${title}"`,
    session: toTimerSession(session as Record<string, unknown>),
  };
}

export async function executeStopTimer(
  args: Record<string, unknown>,
  ctx: MiraToolContext
): Promise<StopTimerResult> {
  let parsedArgs: StopTimerArgs;
  try {
    parsedArgs = stopTimerArgsSchema.parse(args);
  } catch (error) {
    return { error: getZodErrorMessage(error) };
  }

  const workspaceId = getWorkspaceContextWorkspaceId(ctx);
  const sessionId = coerceOptionalString(parsedArgs.sessionId);

  let query = ctx.supabase
    .from('time_tracking_sessions')
    .select('id, title, start_time')
    .eq('user_id', ctx.userId)
    .eq('ws_id', workspaceId)
    .eq('is_running', true);

  if (sessionId) query = query.eq('id', sessionId);

  const { data: session, error: sessionError } = await query
    .limit(1)
    .maybeSingle();

  if (sessionError) return { error: sessionError.message };
  if (!session) return { error: 'No running timer found' };

  const endTime = new Date();
  const startTime = new Date(session.start_time);
  const durationSeconds = Math.round(
    (endTime.getTime() - startTime.getTime()) / 1000
  );

  const { data: stoppedRows, error } = await ctx.supabase
    .from('time_tracking_sessions')
    .update({
      is_running: false,
      end_time: endTime.toISOString(),
      duration_seconds: durationSeconds,
    })
    .eq('id', session.id)
    .eq('user_id', ctx.userId)
    .eq('ws_id', workspaceId)
    .eq('is_running', true)
    .select(
      `
      *,
      category:time_tracking_categories(*),
      task:tasks(*)
    `
    )
    .single();

  if (error) return { error: error.message };
  if (!stoppedRows) {
    return { error: 'Failed to stop timer: no running session was updated' };
  }

  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);

  return {
    success: true,
    message: `Timer stopped: "${session.title}" — ${hours}h ${minutes}m`,
    session: toTimerSession(stoppedRows as Record<string, unknown>, {
      durationSeconds,
      durationFormatted: `${hours}h ${minutes}m`,
    }),
  };
}

export async function executeCreateTimeTrackingEntry(
  args: Record<string, unknown>,
  ctx: MiraToolContext
): Promise<CreateTimeTrackingEntryResult> {
  let parsedArgs: CreateTimeTrackingEntryArgs;
  try {
    parsedArgs = createTimeTrackingEntryArgsSchema.parse(args);
  } catch (error) {
    return { error: getZodErrorMessage(error) };
  }

  const workspaceId = getWorkspaceContextWorkspaceId(ctx);
  const title = parsedArgs.title;

  const startParsed = parseFlexibleDateTime(parsedArgs.startTime, 'startTime', {
    date: parsedArgs.date,
    timezone: ctx.timezone,
  });
  if (!startParsed.ok) return { error: startParsed.error };
  const endParsed = parseFlexibleDateTime(parsedArgs.endTime, 'endTime', {
    date: parsedArgs.date,
    timezone: ctx.timezone,
  });
  if (!endParsed.ok) return { error: endParsed.error };

  const startTime = startParsed.value;
  const endTime = endParsed.value;
  if (endTime <= startTime) {
    return { error: 'endTime must be after startTime' };
  }

  const durationSeconds = Math.floor(
    (endTime.getTime() - startTime.getTime()) / 1000
  );
  if (durationSeconds < MIN_DURATION_SECONDS) {
    return { error: 'Session must be at least 1 minute long' };
  }

  const approvalCheck = await shouldRequireApproval(startTime, ctx);
  if (approvalCheck.requiresApproval) {
    return {
      success: true,
      requiresApproval: true,
      requestCreated: false,
      message:
        `${approvalCheck.reason ?? 'This missed entry requires approval.'} ` +
        'No request has been created yet.',
      nextStep:
        'Inform the user to upload proof images and submit a time tracking request to complete this entry.',
      approvalRequest: {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        titleHint: title,
        descriptionHint: coerceOptionalString(parsedArgs.description),
      },
    };
  }

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

  const { data, error } = await ctx.supabase
    .from('time_tracking_sessions')
    .insert({
      ws_id: workspaceId,
      user_id: ctx.userId,
      title,
      description: coerceOptionalString(parsedArgs.description),
      category_id: categoryId,
      task_id: taskId,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_seconds: durationSeconds,
      is_running: false,
      pending_approval: false,
    })
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
    requiresApproval: false,
    message: 'Time tracking entry created.',
    session: toTimerSession(data as Record<string, unknown>),
  };
}
