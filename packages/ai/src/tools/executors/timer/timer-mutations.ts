import type { MiraToolContext } from '../../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../../workspace-context';
import {
  buildToolFailure,
  coerceOptionalString,
  MIN_DURATION_SECONDS,
  parseFlexibleDateTime,
  shouldRequireApproval,
} from './timer-helpers';
import {
  type CreateTimeTrackerGoalArgs,
  type CreateTimeTrackingEntryArgs,
  createTimeTrackerGoalArgsSchema,
  createTimeTrackingEntryArgsSchema,
  type DeleteTimeTrackerGoalArgs,
  type DeleteTimeTrackingSessionArgs,
  deleteTimeTrackerGoalArgsSchema,
  deleteTimeTrackingSessionArgsSchema,
  getZodErrorMessage,
  type MoveTimeTrackingSessionArgs,
  moveTimeTrackingSessionArgsSchema,
  type StartTimerArgs,
  type StopTimerArgs,
  startTimerArgsSchema,
  stopTimerArgsSchema,
  type UpdateTimeTrackerGoalArgs,
  type UpdateTimeTrackingSessionArgs,
  updateTimeTrackerGoalArgsSchema,
  updateTimeTrackingSessionArgsSchema,
} from './timer-mutation-schemas';

type MutationError = { error: string };

type TimerRelatedEntity = {
  id?: string;
  name?: string | null;
  color?: string | null;
} | null;

export interface TimerSession {
  id: string;
  title: string | null;
  startedAt: string | number;
  endedAt?: string | number | null;
  pausedAt?: string | number | null;
  elapsedMs?: number;
  durationSeconds?: number | null;
  durationFormatted?: string;
  description?: string | null;
  categoryId?: string | null;
  taskId?: string | null;
  isRunning?: boolean;
  pendingApproval?: boolean;
  wsId?: string;
  category?: TimerRelatedEntity;
  task?: TimerRelatedEntity;
}

function toTimerSession(
  row: Record<string, unknown>,
  overrides: Partial<TimerSession> = {}
): TimerSession {
  const startedAt =
    typeof row.start_time === 'string' || typeof row.start_time === 'number'
      ? row.start_time
      : '';

  const baseSession: TimerSession = {
    id: typeof row.id === 'string' ? row.id : '',
    title: typeof row.title === 'string' ? row.title : null,
    startedAt,
    endedAt:
      typeof row.end_time === 'string' || typeof row.end_time === 'number'
        ? row.end_time
        : null,
    durationSeconds:
      typeof row.duration_seconds === 'number' ? row.duration_seconds : null,
    description: typeof row.description === 'string' ? row.description : null,
    categoryId: typeof row.category_id === 'string' ? row.category_id : null,
    taskId: typeof row.task_id === 'string' ? row.task_id : null,
    isRunning: typeof row.is_running === 'boolean' ? row.is_running : undefined,
    pendingApproval:
      typeof row.pending_approval === 'boolean'
        ? row.pending_approval
        : undefined,
    wsId: typeof row.ws_id === 'string' ? row.ws_id : undefined,
    category:
      row.category && typeof row.category === 'object'
        ? (row.category as TimerRelatedEntity)
        : null,
    task:
      row.task && typeof row.task === 'object'
        ? (row.task as TimerRelatedEntity)
        : null,
  };

  return { ...baseSession, ...overrides };
}

type StartTimerResult =
  | MutationError
  | {
      success: true;
      message: string;
      session: TimerSession;
    };

type StopTimerResult =
  | MutationError
  | {
      success: true;
      message: string;
      session: TimerSession;
    };

type CreateTimeTrackingEntryResult =
  | MutationError
  | {
      success: true;
      requiresApproval: false;
      message: string;
      session: TimerSession;
    }
  | {
      success: true;
      requiresApproval: true;
      requestCreated: boolean;
      message?: string;
      nextStep?: string;
      approvalRequest?: {
        startTime: string;
        endTime: string;
        titleHint: string;
        descriptionHint: string | null;
      };
    };

type UpdateTimeTrackingSessionResult =
  | MutationError
  | {
      success: true;
      message: string;
      session?: TimerSession;
    };

type DeleteTimeTrackingSessionResult =
  | MutationError
  | {
      success: true;
      message: string;
    };

type MoveTimeTrackingSessionResult =
  | MutationError
  | {
      success: true;
      message: string;
      session: TimerSession;
    };

type TimerGoal = {
  id: string;
  ws_id: string;
  user_id: string;
  category_id: string | null;
  daily_goal_minutes: number;
  weekly_goal_minutes: number | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
  category:
    | {
        id: string;
        name: string | null;
        color: string | null;
      }
    | Array<{
        id: string;
        name: string | null;
        color: string | null;
      }>
    | null;
};

function normalizeGoalCategory(category: TimerGoal['category']) {
  if (!category) return null;
  if (Array.isArray(category)) return category[0] ?? null;
  return category;
}

function normalizeGoalCategoryIdInput(
  value: unknown
): { ok: true; categoryId: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, categoryId: null };
  }

  if (typeof value !== 'string') {
    return { ok: false, error: 'categoryId must be a string or null' };
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'general') {
    return { ok: true, categoryId: null };
  }

  return { ok: true, categoryId: trimmed };
}

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
  });
  if (!startParsed.ok) return { error: startParsed.error };
  const endParsed = parseFlexibleDateTime(parsedArgs.endTime, 'endTime', {
    date: parsedArgs.date,
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
    });
    if (!parsed.ok) return { error: parsed.error };
    nextStartTime = parsed.value.toISOString();
    updates.start_time = nextStartTime;
  }

  if (parsedArgs.endTime !== undefined) {
    const parsed = parseFlexibleDateTime(parsedArgs.endTime, 'endTime', {
      date: parsedArgs.date,
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

export async function executeCreateTimeTrackerGoal(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  let parsedArgs: CreateTimeTrackerGoalArgs;
  try {
    parsedArgs = createTimeTrackerGoalArgsSchema.parse(args);
  } catch (error) {
    return buildToolFailure(
      'TT_GOAL_CREATE_INVALID_ARGS',
      getZodErrorMessage(error),
      false
    );
  }

  const workspaceId = getWorkspaceContextWorkspaceId(ctx);
  const normalizedCategory = normalizeGoalCategoryIdInput(
    parsedArgs.categoryId
  );
  if (!normalizedCategory.ok) {
    return buildToolFailure(
      'TT_GOAL_CREATE_INVALID_CATEGORY',
      normalizedCategory.error,
      false
    );
  }

  if (normalizedCategory.categoryId) {
    const { data: categoryRow, error: categoryError } = await ctx.supabase
      .from('time_tracking_categories')
      .select('id')
      .eq('id', normalizedCategory.categoryId)
      .eq('ws_id', workspaceId)
      .maybeSingle();

    if (categoryError) {
      return buildToolFailure(
        'TT_GOAL_CREATE_CATEGORY_LOOKUP_FAILED',
        categoryError.message,
        true
      );
    }

    if (!categoryRow) {
      return buildToolFailure(
        'TT_GOAL_CREATE_CATEGORY_NOT_FOUND',
        'Category not found',
        false
      );
    }
  }

  const { data, error } = await ctx.supabase
    .from('time_tracking_goals')
    .insert({
      ws_id: workspaceId,
      user_id: ctx.userId,
      category_id: normalizedCategory.categoryId,
      daily_goal_minutes: parsedArgs.dailyGoalMinutes,
      weekly_goal_minutes: parsedArgs.weeklyGoalMinutes ?? null,
      is_active: parsedArgs.isActive ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select(
      `
      *,
      category:time_tracking_categories(id, name, color)
    `
    )
    .single();

  if (error) {
    return buildToolFailure('TT_GOAL_CREATE_FAILED', error.message, true);
  }

  const goal = data as TimerGoal;
  return {
    success: true,
    message: 'Time tracker goal created',
    goal: {
      ...goal,
      category: normalizeGoalCategory(goal.category),
    },
    meta: {
      workspaceId,
      workspaceContextId: ctx.workspaceContext?.workspaceContextId ?? ctx.wsId,
      isPersonalContext: ctx.workspaceContext?.personal ?? false,
    },
  };
}

export async function executeUpdateTimeTrackerGoal(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  let parsedArgs: UpdateTimeTrackerGoalArgs;
  try {
    parsedArgs = updateTimeTrackerGoalArgsSchema.parse(args);
  } catch (error) {
    return buildToolFailure(
      'TT_GOAL_UPDATE_INVALID_ARGS',
      getZodErrorMessage(error),
      false
    );
  }

  const goalId =
    coerceOptionalString(parsedArgs.goalId) ??
    coerceOptionalString(parsedArgs.id);
  if (!goalId) {
    return buildToolFailure(
      'TT_GOAL_UPDATE_MISSING_ID',
      'goalId is required',
      false
    );
  }

  const workspaceId = getWorkspaceContextWorkspaceId(ctx);

  const { data: existingGoal, error: existingGoalError } = await ctx.supabase
    .from('time_tracking_goals')
    .select('id')
    .eq('id', goalId)
    .eq('ws_id', workspaceId)
    .eq('user_id', ctx.userId)
    .maybeSingle();

  if (existingGoalError) {
    return buildToolFailure(
      'TT_GOAL_UPDATE_LOOKUP_FAILED',
      existingGoalError.message,
      true
    );
  }

  if (!existingGoal) {
    return buildToolFailure(
      'TT_GOAL_UPDATE_NOT_FOUND',
      'Goal not found',
      false
    );
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (parsedArgs.categoryId !== undefined) {
    const normalizedCategory = normalizeGoalCategoryIdInput(
      parsedArgs.categoryId
    );
    if (!normalizedCategory.ok) {
      return buildToolFailure(
        'TT_GOAL_UPDATE_INVALID_CATEGORY',
        normalizedCategory.error,
        false
      );
    }

    if (normalizedCategory.categoryId) {
      const { data: categoryRow, error: categoryError } = await ctx.supabase
        .from('time_tracking_categories')
        .select('id')
        .eq('id', normalizedCategory.categoryId)
        .eq('ws_id', workspaceId)
        .maybeSingle();

      if (categoryError) {
        return buildToolFailure(
          'TT_GOAL_UPDATE_CATEGORY_LOOKUP_FAILED',
          categoryError.message,
          true
        );
      }

      if (!categoryRow) {
        return buildToolFailure(
          'TT_GOAL_UPDATE_CATEGORY_NOT_FOUND',
          'Category not found',
          false
        );
      }
    }

    updates.category_id = normalizedCategory.categoryId;
  }

  if (parsedArgs.dailyGoalMinutes !== undefined) {
    updates.daily_goal_minutes = parsedArgs.dailyGoalMinutes;
  }
  if (parsedArgs.weeklyGoalMinutes !== undefined) {
    updates.weekly_goal_minutes = parsedArgs.weeklyGoalMinutes ?? null;
  }
  if (parsedArgs.isActive !== undefined) {
    updates.is_active = parsedArgs.isActive;
  }

  if (Object.keys(updates).length === 1) {
    return {
      success: true,
      message: 'No fields to update',
      meta: {
        workspaceId,
        workspaceContextId:
          ctx.workspaceContext?.workspaceContextId ?? ctx.wsId,
        isPersonalContext: ctx.workspaceContext?.personal ?? false,
      },
    };
  }

  const { data, error } = await ctx.supabase
    .from('time_tracking_goals')
    .update(updates)
    .eq('id', goalId)
    .eq('ws_id', workspaceId)
    .eq('user_id', ctx.userId)
    .select(
      `
      *,
      category:time_tracking_categories(id, name, color)
    `
    )
    .single();

  if (error) {
    return buildToolFailure('TT_GOAL_UPDATE_FAILED', error.message, true);
  }

  const goal = data as TimerGoal;
  return {
    success: true,
    message: 'Time tracker goal updated',
    goal: {
      ...goal,
      category: normalizeGoalCategory(goal.category),
    },
    meta: {
      workspaceId,
      workspaceContextId: ctx.workspaceContext?.workspaceContextId ?? ctx.wsId,
      isPersonalContext: ctx.workspaceContext?.personal ?? false,
    },
  };
}

export async function executeDeleteTimeTrackerGoal(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  let parsedArgs: DeleteTimeTrackerGoalArgs;
  try {
    parsedArgs = deleteTimeTrackerGoalArgsSchema.parse(args);
  } catch (error) {
    return buildToolFailure(
      'TT_GOAL_DELETE_INVALID_ARGS',
      getZodErrorMessage(error),
      false
    );
  }

  const goalId =
    coerceOptionalString(parsedArgs.goalId) ??
    coerceOptionalString(parsedArgs.id);
  if (!goalId) {
    return buildToolFailure(
      'TT_GOAL_DELETE_MISSING_ID',
      'goalId is required',
      false
    );
  }

  const workspaceId = getWorkspaceContextWorkspaceId(ctx);
  const { data, error } = await ctx.supabase
    .from('time_tracking_goals')
    .delete()
    .eq('id', goalId)
    .eq('ws_id', workspaceId)
    .eq('user_id', ctx.userId)
    .select('id')
    .maybeSingle();

  if (error) {
    return buildToolFailure('TT_GOAL_DELETE_FAILED', error.message, true);
  }

  if (!data) {
    return buildToolFailure(
      'TT_GOAL_DELETE_NOT_FOUND',
      'Goal not found',
      false
    );
  }

  return {
    success: true,
    message: 'Time tracker goal deleted',
    deletedGoalId: goalId,
    meta: {
      workspaceId,
      workspaceContextId: ctx.workspaceContext?.workspaceContextId ?? ctx.wsId,
      isPersonalContext: ctx.workspaceContext?.personal ?? false,
    },
  };
}
