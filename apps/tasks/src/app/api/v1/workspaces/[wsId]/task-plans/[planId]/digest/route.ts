import { type NextRequest, NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  buildTaskPlanDigest,
  isTaskPlanSchemaUnavailableError,
  requireTaskPlanAccess,
  resolveTaskPlanRouteAuth,
  TASK_PLAN_ITEM_SELECT,
  TASK_PLAN_SELECT,
  type TaskPlanRouteContext,
  taskPlanErrorResponse,
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
    return taskPlanSchemaUnavailableResponse({ digest: '' });
  if ('error' in access) return access.error;

  try {
    const [planResult, itemsResult] = await Promise.all([
      (auth.supabase as any)
        .from('task_plans')
        .select(TASK_PLAN_SELECT)
        .eq('id', planId)
        .single(),
      (auth.supabase as any)
        .from('task_plan_items')
        .select(TASK_PLAN_ITEM_SELECT)
        .eq('plan_id', planId)
        .order('planned_start', { ascending: true, nullsFirst: false })
        .order('sort_key', { ascending: true }),
    ]);
    if (planResult.error) throw planResult.error;
    if (itemsResult.error) throw itemsResult.error;

    const digest = buildTaskPlanDigest({
      plan: planResult.data,
      items: itemsResult.data ?? [],
    });

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      digest,
      itemCount: itemsResult.data?.length ?? 0,
    });
  } catch (error) {
    if (isTaskPlanSchemaUnavailableError(error))
      return taskPlanSchemaUnavailableResponse({ digest: '' });
    serverLogger.error('Failed to generate task plan digest', {
      error,
      planId,
    });
    return taskPlanErrorResponse('Failed to generate task plan digest', 500);
  }
}
