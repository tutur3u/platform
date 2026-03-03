import type { MiraToolContext } from '../../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../../workspace-context';
import { buildToolFailure, coerceOptionalString } from './timer-helpers';
import {
  type CreateTimeTrackingCategoryArgs,
  createTimeTrackingCategoryArgsSchema,
  type DeleteTimeTrackingCategoryArgs,
  deleteTimeTrackingCategoryArgsSchema,
  getZodErrorMessage,
  type UpdateTimeTrackingCategoryArgs,
  updateTimeTrackingCategoryArgsSchema,
} from './timer-mutation-schemas';
import type { TimeTrackingCategory } from './timer-mutation-types';

export async function executeCreateTimeTrackingCategory(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  let parsedArgs: CreateTimeTrackingCategoryArgs;
  try {
    parsedArgs = createTimeTrackingCategoryArgsSchema.parse(args);
  } catch (error) {
    return buildToolFailure(
      'TT_CATEGORY_CREATE_INVALID_ARGS',
      getZodErrorMessage(error),
      false
    );
  }

  const workspaceId = getWorkspaceContextWorkspaceId(ctx);
  const name = parsedArgs.name.trim();
  if (!name) {
    return buildToolFailure(
      'TT_CATEGORY_CREATE_NAME_REQUIRED',
      'name is required',
      false
    );
  }

  const { data, error } = await ctx.supabase
    .from('time_tracking_categories')
    .insert({
      ws_id: workspaceId,
      name,
      description: coerceOptionalString(parsedArgs.description),
      color: coerceOptionalString(parsedArgs.color) ?? 'BLUE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id, ws_id, name, description, color, created_at, updated_at')
    .single();

  if (error) {
    return buildToolFailure('TT_CATEGORY_CREATE_FAILED', error.message, true);
  }

  return {
    success: true,
    message: 'Time tracking category created',
    category: data as TimeTrackingCategory,
    meta: {
      workspaceId,
      workspaceContextId: ctx.workspaceContext?.workspaceContextId ?? ctx.wsId,
      isPersonalContext: ctx.workspaceContext?.personal ?? false,
    },
  };
}

export async function executeUpdateTimeTrackingCategory(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  let parsedArgs: UpdateTimeTrackingCategoryArgs;
  try {
    parsedArgs = updateTimeTrackingCategoryArgsSchema.parse(args);
  } catch (error) {
    return buildToolFailure(
      'TT_CATEGORY_UPDATE_INVALID_ARGS',
      getZodErrorMessage(error),
      false
    );
  }

  const categoryId =
    coerceOptionalString(parsedArgs.categoryId) ??
    coerceOptionalString(parsedArgs.id);
  if (!categoryId) {
    return buildToolFailure(
      'TT_CATEGORY_UPDATE_MISSING_ID',
      'categoryId is required',
      false
    );
  }

  const workspaceId = getWorkspaceContextWorkspaceId(ctx);

  const { data: existingCategory, error: existingCategoryError } =
    await ctx.supabase
      .from('time_tracking_categories')
      .select('id')
      .eq('id', categoryId)
      .eq('ws_id', workspaceId)
      .maybeSingle();

  if (existingCategoryError) {
    return buildToolFailure(
      'TT_CATEGORY_UPDATE_LOOKUP_FAILED',
      existingCategoryError.message,
      true
    );
  }

  if (!existingCategory) {
    return buildToolFailure(
      'TT_CATEGORY_UPDATE_NOT_FOUND',
      'Category not found',
      false
    );
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (parsedArgs.name !== undefined) {
    const trimmedName = parsedArgs.name?.trim();
    if (!trimmedName) {
      return buildToolFailure(
        'TT_CATEGORY_UPDATE_INVALID_NAME',
        'name cannot be empty',
        false
      );
    }
    updates.name = trimmedName;
  }

  if (parsedArgs.description !== undefined) {
    updates.description = coerceOptionalString(parsedArgs.description);
  }

  if (parsedArgs.color !== undefined) {
    updates.color = coerceOptionalString(parsedArgs.color);
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
    .from('time_tracking_categories')
    .update(updates)
    .eq('id', categoryId)
    .eq('ws_id', workspaceId)
    .select('id, ws_id, name, description, color, created_at, updated_at')
    .single();

  if (error) {
    return buildToolFailure('TT_CATEGORY_UPDATE_FAILED', error.message, true);
  }

  return {
    success: true,
    message: 'Time tracking category updated',
    category: data as TimeTrackingCategory,
    meta: {
      workspaceId,
      workspaceContextId: ctx.workspaceContext?.workspaceContextId ?? ctx.wsId,
      isPersonalContext: ctx.workspaceContext?.personal ?? false,
    },
  };
}

export async function executeDeleteTimeTrackingCategory(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  let parsedArgs: DeleteTimeTrackingCategoryArgs;
  try {
    parsedArgs = deleteTimeTrackingCategoryArgsSchema.parse(args);
  } catch (error) {
    return buildToolFailure(
      'TT_CATEGORY_DELETE_INVALID_ARGS',
      getZodErrorMessage(error),
      false
    );
  }

  const categoryId =
    coerceOptionalString(parsedArgs.categoryId) ??
    coerceOptionalString(parsedArgs.id);
  if (!categoryId) {
    return buildToolFailure(
      'TT_CATEGORY_DELETE_MISSING_ID',
      'categoryId is required',
      false
    );
  }

  const workspaceId = getWorkspaceContextWorkspaceId(ctx);
  const { data, error } = await ctx.supabase
    .from('time_tracking_categories')
    .delete()
    .eq('id', categoryId)
    .eq('ws_id', workspaceId)
    .select('id')
    .maybeSingle();

  if (error) {
    return buildToolFailure('TT_CATEGORY_DELETE_FAILED', error.message, true);
  }

  if (!data) {
    return buildToolFailure(
      'TT_CATEGORY_DELETE_NOT_FOUND',
      'Category not found',
      false
    );
  }

  return {
    success: true,
    message: 'Time tracking category deleted',
    deletedCategoryId: categoryId,
    meta: {
      workspaceId,
      workspaceContextId: ctx.workspaceContext?.workspaceContextId ?? ctx.wsId,
      isPersonalContext: ctx.workspaceContext?.personal ?? false,
    },
  };
}
