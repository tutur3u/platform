import type { MiraToolContext } from '../../mira-tools';
import {
  coerceOptionalString,
  MIN_DURATION_SECONDS,
  parseFlexibleDateTime,
  shouldRequireApproval,
} from './timer-helpers';
import {
  type CreateTimeTrackingEntryArgs,
  createTimeTrackingEntryArgsSchema,
  type DeleteTimeTrackingSessionArgs,
  deleteTimeTrackingSessionArgsSchema,
  getZodErrorMessage,
  type MoveTimeTrackingSessionArgs,
  moveTimeTrackingSessionArgsSchema,
  type StartTimerArgs,
  type StopTimerArgs,
  startTimerArgsSchema,
  stopTimerArgsSchema,
  type UpdateTimeTrackingSessionArgs,
  updateTimeTrackingSessionArgsSchema,
} from './timer-mutation-schemas';
import {
  type CreateTimeTrackingEntryResult,
  type DeleteTimeTrackingSessionResult,
  type MoveTimeTrackingSessionResult,
  type StartTimerResult,
  type StopTimerResult,
  toTimerSession,
  type UpdateTimeTrackingSessionResult,
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

  const title = parsedArgs.title;
  const now = new Date();

  const { data: runningSessions, error: runningSelectError } =
    await ctx.supabase
      .from('time_tracking_sessions')
      .select('id, start_time')
      .eq('user_id', ctx.userId)
      .eq('ws_id', ctx.wsId)
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
      .eq('ws_id', ctx.wsId)
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
      ws_id: ctx.wsId,
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

  const sessionId = coerceOptionalString(parsedArgs.sessionId);

  let query = ctx.supabase
    .from('time_tracking_sessions')
    .select('id, title, start_time')
    .eq('user_id', ctx.userId)
    .eq('ws_id', ctx.wsId)
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
    .eq('is_running', true)
    .select('id');

  if (error) return { error: error.message };
  if (!stoppedRows?.length) {
    return { error: 'Failed to stop timer: no running session was updated' };
  }

  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);

  return {
    success: true,
    message: `Timer stopped: "${session.title}" — ${hours}h ${minutes}m`,
    session: toTimerSession(session as Record<string, unknown>, {
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

  const { data, error } = await ctx.supabase
    .from('time_tracking_sessions')
    .insert({
      ws_id: ctx.wsId,
      user_id: ctx.userId,
      title,
      description: coerceOptionalString(parsedArgs.description),
      category_id: coerceOptionalString(parsedArgs.categoryId),
      task_id: coerceOptionalString(parsedArgs.taskId),
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

  const sessionId =
    coerceOptionalString(parsedArgs.sessionId) ??
    coerceOptionalString(parsedArgs.id);
  if (!sessionId) return { error: 'sessionId is required' };

  const { data: existing, error: existingError } = await ctx.supabase
    .from('time_tracking_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('ws_id', ctx.wsId)
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
    updates.category_id = coerceOptionalString(parsedArgs.categoryId);
  }
  if (parsedArgs.taskId !== undefined) {
    updates.task_id = coerceOptionalString(parsedArgs.taskId);
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
    .eq('ws_id', ctx.wsId)
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

  const sessionId =
    coerceOptionalString(parsedArgs.sessionId) ??
    coerceOptionalString(parsedArgs.id);
  if (!sessionId) return { error: 'sessionId is required' };

  const { data, error } = await ctx.supabase
    .from('time_tracking_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('ws_id', ctx.wsId)
    .eq('user_id', ctx.userId)
    .select('id');

  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Session not found' };
  return { success: true, message: 'Session deleted' };
}

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

  const sessionId =
    coerceOptionalString(parsedArgs.sessionId) ??
    coerceOptionalString(parsedArgs.id);
  const targetWorkspaceId = coerceOptionalString(parsedArgs.targetWorkspaceId);

  if (!sessionId) return { error: 'sessionId is required' };
  if (!targetWorkspaceId) return { error: 'targetWorkspaceId is required' };

  const { data: sourceMembership, error: sourceMembershipError } =
    await ctx.supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', ctx.wsId)
      .eq('user_id', ctx.userId)
      .maybeSingle();

  if (sourceMembershipError) {
    return { error: sourceMembershipError.message };
  }

  if (!sourceMembership) {
    return { error: 'Source workspace access denied' };
  }

  const { data: targetMembership, error: targetMembershipError } =
    await ctx.supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', targetWorkspaceId)
      .eq('user_id', ctx.userId)
      .maybeSingle();

  if (targetMembershipError) {
    return { error: targetMembershipError.message };
  }

  if (!targetMembership) {
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
    .eq('ws_id', ctx.wsId)
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
    const { data: targetCategory } = await ctx.supabase
      .from('time_tracking_categories')
      .select('id')
      .eq('ws_id', targetWorkspaceId)
      .eq('name', session.category.name)
      .maybeSingle();
    targetCategoryId = targetCategory?.id ?? null;
  }

  let targetTaskId: string | null = null;
  if (session.task?.name) {
    const { data: targetTask } = await ctx.supabase
      .from('tasks')
      .select('id, list:task_lists!inner(board:workspace_boards!inner(ws_id))')
      .eq('list.board.ws_id', targetWorkspaceId)
      .eq('name', session.task.name)
      .maybeSingle();
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
