import type { TablesUpdate } from '@tuturuuu/types';
import type { MiraToolContext } from '../../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../../workspace-context';
import { buildToolFailure, coerceOptionalString } from './timer-helpers';
import {
  type CreateTimeTrackerGoalArgs,
  createTimeTrackerGoalArgsSchema,
  type DeleteTimeTrackerGoalArgs,
  deleteTimeTrackerGoalArgsSchema,
  getZodErrorMessage,
  type UpdateTimeTrackerGoalArgs,
  updateTimeTrackerGoalArgsSchema,
} from './timer-mutation-schemas';
import {
  normalizeGoalCategory,
  normalizeGoalCategoryIdInput,
  type TimerGoal,
} from './timer-mutation-types';

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

  const updates: TablesUpdate<'time_tracking_goals'> = {
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
