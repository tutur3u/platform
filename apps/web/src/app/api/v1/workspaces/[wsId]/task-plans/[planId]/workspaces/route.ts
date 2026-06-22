import { type NextRequest, NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  isTaskPlanSchemaUnavailableError,
  planWorkspacePayloadSchema,
  requireTargetWorkspaceAccess,
  requireTaskPlanAccess,
  resolveTaskPlanRouteAuth,
  type TaskPlanRouteContext,
  taskPlanErrorResponse,
  taskPlanRouteErrorResponse,
  taskPlanSchemaUnavailableResponse,
} from '../../_utils';

type Context = { params: Promise<{ wsId: string; planId: string }> };
const baseContext = (context: Context): TaskPlanRouteContext => ({
  params: context.params.then(({ wsId }) => ({ wsId })),
});

export async function GET(request: NextRequest, context: Context) {
  const auth = await resolveTaskPlanRouteAuth(request, baseContext(context));
  if (auth instanceof NextResponse) return auth;
  const { planId } = await context.params;
  const access = await requireTaskPlanAccess({
    auth,
    planId,
    permission: 'view',
  });
  if ('schemaUnavailable' in access)
    return taskPlanSchemaUnavailableResponse({ workspaces: [] });
  if ('error' in access) return access.error;

  try {
    const { data, error } = await (auth.supabase as any)
      .from('task_plan_workspaces')
      .select('plan_id, ws_id, created_at')
      .eq('plan_id', planId);
    if (error) throw error;
    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      workspaces: data ?? [],
    });
  } catch (error) {
    if (isTaskPlanSchemaUnavailableError(error))
      return taskPlanSchemaUnavailableResponse({ workspaces: [] });
    serverLogger.error('Failed to list task plan workspaces', {
      error,
      planId,
    });
    return taskPlanErrorResponse('Failed to list task plan workspaces', 500);
  }
}

export async function POST(request: NextRequest, context: Context) {
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
    const body = planWorkspacePayloadSchema.parse(await request.json());
    const targetAccess = await requireTargetWorkspaceAccess({
      auth,
      wsId: body.ws_id,
    });
    if ('error' in targetAccess) return targetAccess.error;

    const { data, error } = await (auth.supabase as any)
      .from('task_plan_workspaces')
      .upsert(
        { plan_id: planId, ws_id: body.ws_id, added_by_user_id: auth.user.id },
        { onConflict: 'plan_id,ws_id' }
      )
      .select('plan_id, ws_id, created_at')
      .single();
    if (error) throw error;
    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      workspace: data,
    });
  } catch (error) {
    if (isTaskPlanSchemaUnavailableError(error))
      return taskPlanSchemaUnavailableResponse();
    serverLogger.error('Failed to add task plan workspace', { error, planId });
    return taskPlanRouteErrorResponse(
      error,
      'Failed to add task plan workspace'
    );
  }
}

export async function DELETE(request: NextRequest, context: Context) {
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
    const body = planWorkspacePayloadSchema.parse(await request.json());
    const { error } = await (auth.supabase as any)
      .from('task_plan_workspaces')
      .delete()
      .eq('plan_id', planId)
      .eq('ws_id', body.ws_id);
    if (error) throw error;
    return NextResponse.json({ ok: true, schemaAvailable: true });
  } catch (error) {
    if (isTaskPlanSchemaUnavailableError(error))
      return taskPlanSchemaUnavailableResponse();
    serverLogger.error('Failed to remove task plan workspace', {
      error,
      planId,
    });
    return taskPlanRouteErrorResponse(
      error,
      'Failed to remove task plan workspace'
    );
  }
}
