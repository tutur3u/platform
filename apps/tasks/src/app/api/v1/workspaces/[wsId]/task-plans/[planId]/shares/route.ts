import { type NextRequest, NextResponse } from 'next/server';
import {
  isTaskPlanSchemaUnavailableError,
  normalizeTaskPlanShareEmail,
  planShareCreateSchema,
  planShareDeleteSchema,
  planShareUpdateSchema,
  requireIntendedWorkspace,
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
    return taskPlanSchemaUnavailableResponse({ shares: [] });
  if ('error' in access) return access.error;

  try {
    const { data, error } = await (auth.supabase as any)
      .from('task_plan_shares')
      .select('*')
      .eq('plan_id', planId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      shares: data ?? [],
    });
  } catch (error) {
    if (isTaskPlanSchemaUnavailableError(error))
      return taskPlanSchemaUnavailableResponse({ shares: [] });
    console.error('Failed to list task plan shares', { error, planId });
    return taskPlanErrorResponse('Failed to list task plan shares', 500);
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
    const body = planShareCreateSchema.parse(await request.json());
    if (body.shared_with_ws_id) {
      const intendedAccess = await requireIntendedWorkspace({
        auth,
        planId,
        wsId: body.shared_with_ws_id,
      });
      if ('schemaUnavailable' in intendedAccess)
        return taskPlanSchemaUnavailableResponse();
      if ('error' in intendedAccess) return intendedAccess.error;
    }

    const { data, error } = await (auth.supabase as any)
      .from('task_plan_shares')
      .insert({
        plan_id: planId,
        shared_with_ws_id: body.shared_with_ws_id ?? null,
        shared_with_user_id: body.shared_with_user_id ?? null,
        shared_with_email: normalizeTaskPlanShareEmail(body.shared_with_email),
        permission: body.permission,
        shared_by_user_id: auth.user.id,
      })
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, schemaAvailable: true, share: data });
  } catch (error) {
    if (isTaskPlanSchemaUnavailableError(error))
      return taskPlanSchemaUnavailableResponse();
    console.error('Failed to create task plan share', { error, planId });
    return taskPlanRouteErrorResponse(
      error,
      'Failed to create task plan share'
    );
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
    const body = planShareUpdateSchema.parse(await request.json());
    const { data, error } = await (auth.supabase as any)
      .from('task_plan_shares')
      .update({ permission: body.permission })
      .eq('plan_id', planId)
      .eq('id', body.share_id)
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, schemaAvailable: true, share: data });
  } catch (error) {
    if (isTaskPlanSchemaUnavailableError(error))
      return taskPlanSchemaUnavailableResponse();
    console.error('Failed to update task plan share', { error, planId });
    return taskPlanRouteErrorResponse(
      error,
      'Failed to update task plan share'
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
    const body = planShareDeleteSchema.parse(await request.json());
    const { error } = await (auth.supabase as any)
      .from('task_plan_shares')
      .delete()
      .eq('plan_id', planId)
      .eq('id', body.share_id);
    if (error) throw error;
    return NextResponse.json({ ok: true, schemaAvailable: true });
  } catch (error) {
    if (isTaskPlanSchemaUnavailableError(error))
      return taskPlanSchemaUnavailableResponse();
    console.error('Failed to delete task plan share', { error, planId });
    return taskPlanRouteErrorResponse(
      error,
      'Failed to delete task plan share'
    );
  }
}
