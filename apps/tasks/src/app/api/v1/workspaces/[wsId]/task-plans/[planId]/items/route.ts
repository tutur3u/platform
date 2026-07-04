import { type NextRequest, NextResponse } from 'next/server';
import {
  createSourceTaskFromPlanItem,
  isTaskPlanSchemaUnavailableError,
  planItemCreateSchema,
  planItemDeleteSchema,
  planItemUpdateSchema,
  requireIntendedWorkspace,
  requireTargetWorkspaceAccess,
  requireTaskPlanAccess,
  resolveTaskPlanRouteAuth,
  TASK_PLAN_ITEM_SELECT,
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
    return taskPlanSchemaUnavailableResponse({ items: [] });
  if ('error' in access) return access.error;

  try {
    const { data, error } = await (auth.supabase as any)
      .from('task_plan_items')
      .select(TASK_PLAN_ITEM_SELECT)
      .eq('plan_id', planId)
      .order('planned_start', { ascending: true, nullsFirst: false })
      .order('sort_key', { ascending: true });
    if (error) throw error;
    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      items: data ?? [],
    });
  } catch (error) {
    if (isTaskPlanSchemaUnavailableError(error))
      return taskPlanSchemaUnavailableResponse({ items: [] });
    console.error('Failed to list task plan items', { error, planId });
    return taskPlanErrorResponse('Failed to list task plan items', 500);
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
    const body = planItemCreateSchema.parse(await request.json());
    const targetWsId = body.target_ws_id ?? undefined;
    const targetAccess = await requireTargetWorkspaceAccess({
      auth,
      wsId: targetWsId,
    });
    if ('error' in targetAccess) return targetAccess.error;
    const intendedAccess = await requireIntendedWorkspace({
      auth,
      planId,
      wsId: targetWsId,
    });
    if ('schemaUnavailable' in intendedAccess)
      return taskPlanSchemaUnavailableResponse();
    if ('error' in intendedAccess) return intendedAccess.error;

    let taskId = body.task_id ?? null;
    let sourceTask: any = null;
    if (body.source_task) {
      const sourceTargetWsId = targetWsId;
      if (!sourceTargetWsId) {
        return taskPlanErrorResponse(
          'Target workspace is required to create a source task',
          400
        );
      }
      const created = await createSourceTaskFromPlanItem({
        auth,
        payload: body.source_task,
        request,
        targetWsId: sourceTargetWsId,
      });
      if ('error' in created) return created.error;
      sourceTask = created.task;
      taskId = sourceTask?.id ?? null;
    }

    const { data, error } = await (auth.supabase as any)
      .from('task_plan_items')
      .insert({
        plan_id: planId,
        task_id: taskId,
        target_ws_id: body.target_ws_id ?? null,
        target_board_id: body.target_board_id ?? null,
        target_list_id: body.target_list_id ?? null,
        planned_start: body.planned_start ?? null,
        planned_end: body.planned_end ?? null,
        sort_key: body.sort_key ?? Date.now(),
        status: body.status,
        notes: body.notes ?? null,
        snapshot_title: body.snapshot_title ?? sourceTask?.name ?? null,
        created_by_user_id: auth.user.id,
      })
      .select(TASK_PLAN_ITEM_SELECT)
      .single();

    if (error) throw error;
    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      item: sourceTask ? { ...data, task: sourceTask } : data,
      task: sourceTask,
    });
  } catch (error) {
    if (isTaskPlanSchemaUnavailableError(error))
      return taskPlanSchemaUnavailableResponse();
    console.error('Failed to create task plan item', { error, planId });
    return taskPlanRouteErrorResponse(error, 'Failed to create task plan item');
  }
}

export async function PATCH(request: NextRequest, context: Context) {
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
    const body = planItemUpdateSchema.parse(await request.json());
    const targetAccess = await requireTargetWorkspaceAccess({
      auth,
      wsId: body.target_ws_id,
    });
    if ('error' in targetAccess) return targetAccess.error;
    const intendedAccess = await requireIntendedWorkspace({
      auth,
      planId,
      wsId: body.target_ws_id,
    });
    if ('schemaUnavailable' in intendedAccess)
      return taskPlanSchemaUnavailableResponse();
    if ('error' in intendedAccess) return intendedAccess.error;

    const { item_id, source_task: _sourceTask, ...updates } = body;
    const { data, error } = await (auth.supabase as any)
      .from('task_plan_items')
      .update(updates)
      .eq('plan_id', planId)
      .eq('id', item_id)
      .select(TASK_PLAN_ITEM_SELECT)
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, schemaAvailable: true, item: data });
  } catch (error) {
    if (isTaskPlanSchemaUnavailableError(error))
      return taskPlanSchemaUnavailableResponse();
    console.error('Failed to update task plan item', { error, planId });
    return taskPlanRouteErrorResponse(error, 'Failed to update task plan item');
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
    const body = planItemDeleteSchema.parse(await request.json());
    const { error } = await (auth.supabase as any)
      .from('task_plan_items')
      .delete()
      .eq('plan_id', planId)
      .eq('id', body.item_id);
    if (error) throw error;
    return NextResponse.json({ ok: true, schemaAvailable: true });
  } catch (error) {
    if (isTaskPlanSchemaUnavailableError(error))
      return taskPlanSchemaUnavailableResponse();
    console.error('Failed to delete task plan item', { error, planId });
    return taskPlanRouteErrorResponse(error, 'Failed to delete task plan item');
  }
}
