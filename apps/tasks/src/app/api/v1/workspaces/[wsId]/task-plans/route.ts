import { type NextRequest, NextResponse } from 'next/server';
import {
  isTaskPlanSchemaUnavailableError,
  planCreateSchema,
  requireTargetWorkspaceAccess,
  resolveTaskPlanRouteAuth,
  TASK_PLAN_SELECT,
  type TaskPlanRouteAuth,
  type TaskPlanRouteContext,
  taskPlanErrorResponse,
  taskPlanRouteErrorResponse,
  taskPlanSchemaUnavailableResponse,
} from './_utils';

async function hydratePlans(auth: TaskPlanRouteAuth, plans: any[]) {
  if (plans.length === 0) return plans;
  const planIds = plans.map((plan) => plan.id);
  const [workspacesResult, itemsResult, sharesResult] = await Promise.all([
    (auth.supabase as any)
      .from('task_plan_workspaces')
      .select('plan_id, ws_id, created_at')
      .in('plan_id', planIds),
    (auth.supabase as any)
      .from('task_plan_items')
      .select(
        'plan_id, id, task_id, target_ws_id, planned_start, planned_end, status'
      )
      .in('plan_id', planIds),
    (auth.supabase as any)
      .from('task_plan_shares')
      .select(
        'plan_id, id, shared_with_ws_id, shared_with_user_id, shared_with_email, permission'
      )
      .in('plan_id', planIds),
  ]);

  for (const result of [workspacesResult, itemsResult, sharesResult]) {
    if (result.error) throw result.error;
  }

  const workspacesByPlan = new Map<string, any[]>();
  const itemsByPlan = new Map<string, any[]>();
  const sharesByPlan = new Map<string, any[]>();

  for (const row of workspacesResult.data ?? []) {
    workspacesByPlan.set(row.plan_id, [
      ...(workspacesByPlan.get(row.plan_id) ?? []),
      row,
    ]);
  }
  for (const row of itemsResult.data ?? []) {
    itemsByPlan.set(row.plan_id, [
      ...(itemsByPlan.get(row.plan_id) ?? []),
      row,
    ]);
  }
  for (const row of sharesResult.data ?? []) {
    sharesByPlan.set(row.plan_id, [
      ...(sharesByPlan.get(row.plan_id) ?? []),
      row,
    ]);
  }

  return plans.map((plan) => ({
    ...plan,
    workspaces: workspacesByPlan.get(plan.id) ?? [],
    items: itemsByPlan.get(plan.id) ?? [],
    shares: sharesByPlan.get(plan.id) ?? [],
  }));
}

export async function GET(request: NextRequest, context: TaskPlanRouteContext) {
  const auth = await resolveTaskPlanRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const periodType = url.searchParams.get('period_type') || undefined;
  const status = url.searchParams.get('status') || undefined;

  try {
    let query = (auth.supabase as any)
      .from('task_plans')
      .select(TASK_PLAN_SELECT)
      .order('period_start', { ascending: false })
      .order('created_at', { ascending: false });

    if (periodType) query = query.eq('period_type', periodType);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    const plans = await hydratePlans(auth, data ?? []);
    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      plans,
    });
  } catch (error) {
    if (isTaskPlanSchemaUnavailableError(error)) {
      return taskPlanSchemaUnavailableResponse({ plans: [] });
    }

    console.error('Failed to list task plans', { error });
    return taskPlanErrorResponse('Failed to list task plans', 500);
  }
}

export async function POST(
  request: NextRequest,
  context: TaskPlanRouteContext
) {
  const auth = await resolveTaskPlanRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = planCreateSchema.parse(await request.json());
    const intendedWorkspaceIds = Array.from(
      new Set(
        [
          auth.wsId,
          body.default_target_ws_id,
          ...(body.intended_workspace_ids ?? []),
        ].filter(Boolean)
      )
    ) as string[];

    for (const targetWsId of intendedWorkspaceIds) {
      const targetAccess = await requireTargetWorkspaceAccess({
        auth,
        wsId: targetWsId,
      });
      if ('error' in targetAccess) return targetAccess.error;
    }

    const { data: plan, error } = await (auth.supabase as any)
      .from('task_plans')
      .insert({
        owner_id: auth.user.id,
        personal_ws_id: auth.wsId,
        title: body.title,
        period_type: body.period_type,
        period_start: body.period_start,
        period_end: body.period_end,
        timezone: body.timezone,
        status: body.status,
        default_target_ws_id: body.default_target_ws_id ?? null,
        default_target_board_id: body.default_target_board_id ?? null,
        default_target_list_id: body.default_target_list_id ?? null,
      })
      .select(TASK_PLAN_SELECT)
      .single();

    if (error) throw error;

    if (intendedWorkspaceIds.length > 0) {
      const workspaceRows = intendedWorkspaceIds.map((wsId) => ({
        plan_id: plan.id,
        ws_id: wsId,
        added_by_user_id: auth.user.id,
      }));
      const { error: workspaceError } = await (auth.supabase as any)
        .from('task_plan_workspaces')
        .upsert(workspaceRows, { onConflict: 'plan_id,ws_id' });

      if (workspaceError) throw workspaceError;
    }

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      plan: {
        ...plan,
        workspaces: intendedWorkspaceIds.map((wsId) => ({
          plan_id: plan.id,
          ws_id: wsId,
        })),
        items: [],
        shares: [],
      },
    });
  } catch (error) {
    if (isTaskPlanSchemaUnavailableError(error)) {
      return taskPlanSchemaUnavailableResponse();
    }

    console.error('Failed to create task plan', { error });
    return taskPlanRouteErrorResponse(error, 'Failed to create task plan');
  }
}
