import { type NextRequest, NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  isTaskPlanSchemaUnavailableError,
  planUpdateSchema,
  requireIntendedWorkspace,
  requireTargetWorkspaceAccess,
  requireTaskPlanAccess,
  resolveTaskPlanRouteAuth,
  TASK_PLAN_SELECT,
  type TaskPlanRouteContext,
  taskPlanErrorResponse,
  taskPlanRouteErrorResponse,
  taskPlanSchemaUnavailableResponse,
} from '../_utils';

type TaskPlanDetailContext = {
  params: Promise<{ wsId: string; planId: string }>;
};

function baseContext(context: TaskPlanDetailContext): TaskPlanRouteContext {
  return {
    params: context.params.then(({ wsId }) => ({ wsId })),
  };
}

export async function GET(
  request: NextRequest,
  context: TaskPlanDetailContext
) {
  const auth = await resolveTaskPlanRouteAuth(request, baseContext(context));
  if (auth instanceof NextResponse) return auth;
  const { planId } = await context.params;

  const access = await requireTaskPlanAccess({
    auth,
    planId,
    permission: 'view',
  });
  if ('schemaUnavailable' in access) return taskPlanSchemaUnavailableResponse();
  if ('error' in access) return access.error;

  try {
    const [planResult, workspacesResult, itemsResult, sharesResult] =
      await Promise.all([
        (auth.supabase as any)
          .from('task_plans')
          .select(TASK_PLAN_SELECT)
          .eq('id', planId)
          .single(),
        (auth.supabase as any)
          .from('task_plan_workspaces')
          .select('*')
          .eq('plan_id', planId),
        (auth.supabase as any)
          .from('task_plan_items')
          .select('*')
          .eq('plan_id', planId)
          .order('sort_key'),
        (auth.supabase as any)
          .from('task_plan_shares')
          .select('*')
          .eq('plan_id', planId),
      ]);

    for (const result of [
      planResult,
      workspacesResult,
      itemsResult,
      sharesResult,
    ]) {
      if (result.error) throw result.error;
    }

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      plan: {
        ...planResult.data,
        workspaces: workspacesResult.data ?? [],
        items: itemsResult.data ?? [],
        shares: sharesResult.data ?? [],
      },
    });
  } catch (error) {
    if (isTaskPlanSchemaUnavailableError(error))
      return taskPlanSchemaUnavailableResponse();
    serverLogger.error('Failed to load task plan', { error, planId });
    return taskPlanErrorResponse('Failed to load task plan', 500);
  }
}

export async function PATCH(
  request: NextRequest,
  context: TaskPlanDetailContext
) {
  const auth = await resolveTaskPlanRouteAuth(request, baseContext(context));
  if (auth instanceof NextResponse) return auth;
  const { planId } = await context.params;

  const access = await requireTaskPlanAccess({
    auth,
    planId,
    permission: 'edit',
  });
  if ('schemaUnavailable' in access) return taskPlanSchemaUnavailableResponse();
  if ('error' in access) return access.error;

  try {
    const body = planUpdateSchema.parse(await request.json());
    if (body.default_target_ws_id) {
      const targetAccess = await requireTargetWorkspaceAccess({
        auth,
        wsId: body.default_target_ws_id,
      });
      if ('error' in targetAccess) return targetAccess.error;

      const intendedAccess = await requireIntendedWorkspace({
        auth,
        planId,
        wsId: body.default_target_ws_id,
      });
      if ('schemaUnavailable' in intendedAccess)
        return taskPlanSchemaUnavailableResponse();
      if ('error' in intendedAccess) return intendedAccess.error;
    }

    const { intended_workspace_ids: _, ...updates } = body;
    const { data, error } = await (auth.supabase as any)
      .from('task_plans')
      .update(updates)
      .eq('id', planId)
      .select(TASK_PLAN_SELECT)
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, schemaAvailable: true, plan: data });
  } catch (error) {
    if (isTaskPlanSchemaUnavailableError(error))
      return taskPlanSchemaUnavailableResponse();
    serverLogger.error('Failed to update task plan', { error, planId });
    return taskPlanRouteErrorResponse(error, 'Failed to update task plan');
  }
}

export async function DELETE(
  request: NextRequest,
  context: TaskPlanDetailContext
) {
  const auth = await resolveTaskPlanRouteAuth(request, baseContext(context));
  if (auth instanceof NextResponse) return auth;
  const { planId } = await context.params;

  try {
    const { error } = await (auth.supabase as any)
      .from('task_plans')
      .delete()
      .eq('id', planId)
      .eq('owner_id', auth.user.id);

    if (error) throw error;
    return NextResponse.json({ ok: true, schemaAvailable: true });
  } catch (error) {
    if (isTaskPlanSchemaUnavailableError(error))
      return taskPlanSchemaUnavailableResponse();
    serverLogger.error('Failed to delete task plan', { error, planId });
    return taskPlanErrorResponse('Failed to delete task plan', 500);
  }
}
