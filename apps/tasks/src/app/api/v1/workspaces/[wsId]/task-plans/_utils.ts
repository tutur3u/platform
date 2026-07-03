import type { TaskRouteAuthContext } from '@tuturuuu/apis/tu-do/tasks/route';
import { handleTaskRoutePOST } from '@tuturuuu/apis/tu-do/tasks/route';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAuthenticatedSessionUser } from '@/lib/app-session-user';
import { serverLogger } from '@/lib/infrastructure/log-drain';

export const taskPlanPermissionSchema = z.enum(['view', 'edit']);
export const taskPlanPeriodSchema = z.enum(['week', 'month', 'year']);
export const taskPlanStatusSchema = z.enum([
  'draft',
  'active',
  'sent',
  'archived',
]);
export const taskPlanItemStatusSchema = z.enum([
  'draft',
  'planned',
  'in_progress',
  'done',
  'removed',
]);

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Expected YYYY-MM-DD');

export const planCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  period_type: taskPlanPeriodSchema,
  period_start: dateStringSchema,
  period_end: dateStringSchema,
  timezone: z.string().trim().min(1).max(128).default('UTC'),
  status: taskPlanStatusSchema.default('draft'),
  default_target_ws_id: z.guid().nullable().optional(),
  default_target_board_id: z.guid().nullable().optional(),
  default_target_list_id: z.guid().nullable().optional(),
  intended_workspace_ids: z.array(z.guid()).optional(),
});

export const planUpdateSchema = planCreateSchema.partial().extend({
  archived_at: z.string().datetime().nullable().optional(),
});

export const planWorkspacePayloadSchema = z.object({
  ws_id: z.guid(),
});

export const planShareCreateSchema = z
  .object({
    shared_with_ws_id: z.guid().nullable().optional(),
    shared_with_user_id: z.guid().nullable().optional(),
    shared_with_email: z.string().email().nullable().optional(),
    permission: taskPlanPermissionSchema.default('view'),
  })
  .refine(
    (value) =>
      [
        value.shared_with_ws_id,
        value.shared_with_user_id,
        value.shared_with_email,
      ].filter(Boolean).length === 1,
    'Exactly one share recipient is required'
  );

export const planShareUpdateSchema = z.object({
  share_id: z.guid(),
  permission: taskPlanPermissionSchema,
});

export const planShareDeleteSchema = z.object({
  share_id: z.guid(),
});

export const planItemCreateSchema = z.object({
  task_id: z.guid().nullable().optional(),
  target_ws_id: z.guid().nullable().optional(),
  target_board_id: z.guid().nullable().optional(),
  target_list_id: z.guid().nullable().optional(),
  planned_start: dateStringSchema.nullable().optional(),
  planned_end: dateStringSchema.nullable().optional(),
  sort_key: z.number().finite().optional(),
  status: taskPlanItemStatusSchema.default('planned'),
  notes: z.string().max(10_000).nullable().optional(),
  snapshot_title: z.string().trim().max(256).nullable().optional(),
  source_task: z
    .object({
      name: z.string().trim().min(1).max(128),
      description: z.string().max(100_000).nullable().optional(),
      listId: z.guid(),
      priority: z
        .enum(['low', 'normal', 'high', 'critical'])
        .nullable()
        .optional(),
      start_date: z.string().nullable().optional(),
      end_date: z.string().nullable().optional(),
      estimation_points: z.number().nullable().optional(),
      label_ids: z.array(z.guid()).optional(),
      project_ids: z.array(z.guid()).optional(),
      assignee_ids: z.array(z.guid()).optional(),
    })
    .optional(),
});

export const planItemUpdateSchema = planItemCreateSchema.partial().extend({
  item_id: z.guid(),
});

export const planItemDeleteSchema = z.object({
  item_id: z.guid(),
});

export type TaskPlanRouteContext = {
  params: Promise<{ wsId: string }>;
};

export type TaskPlanRouteAuth = {
  sbAdmin: TypedSupabaseClient;
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
  wsId: string;
};

export const TASK_PLAN_SELECT = `
  id,
  owner_id,
  personal_ws_id,
  title,
  period_type,
  period_start,
  period_end,
  timezone,
  status,
  default_target_ws_id,
  default_target_board_id,
  default_target_list_id,
  created_at,
  updated_at,
  archived_at
`;

export const TASK_PLAN_ITEM_SELECT = `
  id,
  plan_id,
  task_id,
  target_ws_id,
  target_board_id,
  target_list_id,
  planned_start,
  planned_end,
  sort_key,
  status,
  notes,
  snapshot_title,
  created_by_user_id,
  created_at,
  updated_at
`;

export function normalizeTaskPlanShareEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

export function isTaskPlanSchemaUnavailableError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as {
    code?: string | null;
    details?: string | null;
    message?: string | null;
  };
  const code = candidate.code ?? '';
  const text = [candidate.message, candidate.details]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const mentionsTaskPlanSchema =
    text.includes('task_plans') ||
    text.includes('task_plan_items') ||
    text.includes('task_plan_shares') ||
    text.includes('task_plan_workspaces');
  const looksLikeMissingSchema =
    text.includes('schema cache') ||
    text.includes('could not find') ||
    text.includes('does not exist') ||
    text.includes('column') ||
    text.includes('relation');

  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    (mentionsTaskPlanSchema && looksLikeMissingSchema)
  );
}

export function taskPlanSchemaUnavailableResponse(
  extra?: Record<string, unknown>
) {
  return NextResponse.json({
    ok: false,
    code: 'schema_unavailable',
    schemaAvailable: false,
    message:
      'Task plans are not available until the latest database migration is applied.',
    ...extra,
  });
}

export function taskPlanErrorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export function taskPlanRouteErrorResponse(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return taskPlanErrorResponse(
      error.issues[0]?.message ?? 'Invalid request',
      400
    );
  }

  if (isTaskPlanSchemaUnavailableError(error)) {
    return taskPlanSchemaUnavailableResponse();
  }

  return taskPlanErrorResponse(fallback, 500);
}

export async function resolveTaskPlanRouteAuth(
  request: NextRequest,
  context: TaskPlanRouteContext
): Promise<TaskPlanRouteAuth | NextResponse> {
  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return taskPlanErrorResponse('Unauthorized', 401);
  }

  const { wsId: rawWsId } = await context.params;
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);
  const memberCheck = await verifyWorkspaceMembershipType({
    wsId,
    userId: user.id,
    supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return taskPlanErrorResponse('Failed to verify workspace membership', 500);
  }

  if (!memberCheck.ok) {
    return taskPlanErrorResponse('Workspace access denied', 403);
  }

  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;

  return { sbAdmin, supabase, user, wsId };
}

export async function requireTaskPlanAccess({
  auth,
  permission,
  planId,
}: {
  auth: TaskPlanRouteAuth;
  permission: 'view' | 'edit';
  planId: string;
}) {
  const { data, error } = await auth.supabase.rpc('can_access_task_plan', {
    p_plan_id: planId,
    p_required_permission: permission,
    p_user_id: auth.user.id,
  } as never);

  if (error) {
    if (isTaskPlanSchemaUnavailableError(error)) {
      return { schemaUnavailable: true as const };
    }

    serverLogger.error('Failed to verify task plan access', {
      error,
      planId,
      permission,
    });
    return {
      error: taskPlanErrorResponse('Failed to verify task plan access', 500),
    };
  }

  if (data !== true) {
    return { error: taskPlanErrorResponse('Task plan access denied', 403) };
  }

  return { ok: true as const };
}

export async function requireTargetWorkspaceAccess({
  auth,
  wsId,
}: {
  auth: TaskPlanRouteAuth;
  wsId?: string | null;
}) {
  if (!wsId) return { ok: true as const };

  const memberCheck = await verifyWorkspaceMembershipType({
    wsId,
    userId: auth.user.id,
    supabase: auth.supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return {
      error: taskPlanErrorResponse(
        'Failed to verify target workspace membership',
        500
      ),
    };
  }

  if (!memberCheck.ok) {
    return {
      error: taskPlanErrorResponse('Target workspace access denied', 403),
    };
  }

  return { ok: true as const };
}

export async function requireIntendedWorkspace({
  auth,
  planId,
  wsId,
}: {
  auth: TaskPlanRouteAuth;
  planId: string;
  wsId?: string | null;
}) {
  if (!wsId) return { ok: true as const };

  const { data, error } = await (auth.supabase as any)
    .from('task_plan_workspaces')
    .select('ws_id')
    .eq('plan_id', planId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) {
    if (isTaskPlanSchemaUnavailableError(error)) {
      return { schemaUnavailable: true as const };
    }

    serverLogger.error('Failed to verify task plan intended workspace', {
      error,
      planId,
      wsId,
    });
    return {
      error: taskPlanErrorResponse('Failed to verify intended workspace', 500),
    };
  }

  if (!data) {
    return {
      error: taskPlanErrorResponse('Workspace is not part of this plan', 400),
    };
  }

  return { ok: true as const };
}

export async function createSourceTaskFromPlanItem({
  auth,
  payload,
  request,
  targetWsId,
}: {
  auth: TaskPlanRouteAuth;
  payload: z.infer<typeof planItemCreateSchema>['source_task'];
  request: NextRequest;
  targetWsId: string;
}) {
  if (!payload) return { task: null };

  const taskAuth: TaskRouteAuthContext = {
    supabase: auth.supabase,
    user: auth.user,
  };
  const url = new URL(request.url);
  const taskRequest = new Request(url.href, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }) as NextRequest;
  const response = await handleTaskRoutePOST(
    taskRequest,
    { params: Promise.resolve({ wsId: targetWsId }) },
    taskAuth
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      error: NextResponse.json(data, { status: response.status }),
    };
  }

  return { task: data.task ?? data };
}

export function buildTaskPlanDigest({
  items,
  plan,
}: {
  items: Array<Record<string, any>>;
  plan: Record<string, any>;
}) {
  const lines = [
    `# ${plan.title}`,
    '',
    `${plan.period_start} to ${plan.period_end}`,
    '',
  ];
  const grouped = new Map<string, Array<Record<string, any>>>();

  for (const item of items) {
    const key = item.planned_start ?? 'Unscheduled';
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }

  for (const [date, groupItems] of [...grouped.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    lines.push(`## ${date}`);

    for (const item of groupItems.sort(
      (a, b) => (a.sort_key ?? 0) - (b.sort_key ?? 0)
    )) {
      const title = item.task?.name ?? item.snapshot_title ?? 'Untitled task';
      const scope = item.target_ws_id ? ` (${item.target_ws_id})` : '';
      lines.push(`- ${title}${scope}`);
    }

    lines.push('');
  }

  return lines.join('\n').trim();
}
