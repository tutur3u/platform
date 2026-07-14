import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  handleTaskRoutePOST,
  type TaskRouteAuthContext,
} from '@tuturuuu/tasks-api/server/tasks/route';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import {
  MAX_COLOR_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_TASK_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SessionAuthContext } from '@/lib/api-auth';

export const TASK_TEMPLATES_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'tasks'],
} as const;

const uuidString = z.guid();
const prioritySchema = z.enum(['critical', 'high', 'normal', 'low']);
const visibilitySchema = z.enum(['private', 'workspace']);

export const createTaskTemplateSchema = z.object({
  assignee_ids: z.array(uuidString).default([]),
  default_board_id: uuidString.nullish(),
  default_list_id: uuidString.nullish(),
  description: z.string().max(MAX_LONG_TEXT_LENGTH).nullish(),
  description_yjs_state: z.array(z.number().int().min(0).max(255)).nullish(),
  end_date: z.string().max(MAX_COLOR_LENGTH).nullish(),
  estimation_points: z.number().int().min(0).max(8).nullish(),
  key: z.string().trim().min(1).max(120).optional(),
  label_ids: z.array(uuidString).default([]),
  name: z.string().trim().min(1).max(MAX_TASK_NAME_LENGTH),
  priority: prioritySchema.nullish(),
  project_ids: z.array(uuidString).default([]),
  slug: z.string().trim().min(1).max(120).optional(),
  source_task_id: uuidString.nullish(),
  start_date: z.string().max(MAX_COLOR_LENGTH).nullish(),
  task_name: z.string().trim().min(1).max(MAX_TASK_NAME_LENGTH).optional(),
  title: z.string().trim().min(1).max(MAX_TASK_NAME_LENGTH).optional(),
  visibility: visibilitySchema.default('private'),
});

export const updateTaskTemplateSchema = z.object({
  archived: z.boolean().optional(),
  assignee_ids: z.array(uuidString).optional(),
  default_board_id: uuidString.nullish(),
  default_list_id: uuidString.nullish(),
  description: z.string().max(MAX_LONG_TEXT_LENGTH).nullish(),
  description_yjs_state: z.array(z.number().int().min(0).max(255)).nullish(),
  end_date: z.string().max(MAX_COLOR_LENGTH).nullish(),
  estimation_points: z.number().int().min(0).max(8).nullish(),
  key: z.string().trim().min(1).max(120).optional(),
  label_ids: z.array(uuidString).optional(),
  name: z.string().trim().min(1).max(MAX_TASK_NAME_LENGTH).optional(),
  priority: prioritySchema.nullish(),
  project_ids: z.array(uuidString).optional(),
  slug: z.string().trim().min(1).max(120).optional(),
  source_task_id: uuidString.nullish(),
  start_date: z.string().max(MAX_COLOR_LENGTH).nullish(),
  task_name: z.string().trim().min(1).max(MAX_TASK_NAME_LENGTH).optional(),
  title: z.string().trim().min(1).max(MAX_TASK_NAME_LENGTH).optional(),
  visibility: visibilitySchema.optional(),
});

export const instantiateTaskTemplateSchema = z.object({
  assignee_ids: z.array(uuidString).optional(),
  description: z.string().max(MAX_LONG_TEXT_LENGTH).nullish(),
  description_yjs_state: z.array(z.number().int().min(0).max(255)).nullish(),
  end_date: z.string().max(MAX_COLOR_LENGTH).nullish(),
  estimation_points: z.number().int().min(0).max(8).nullish(),
  label_ids: z.array(uuidString).optional(),
  listId: uuidString.optional(),
  list_id: uuidString.optional(),
  name: z.string().trim().min(1).max(MAX_TASK_NAME_LENGTH).optional(),
  priority: prioritySchema.nullish(),
  project_ids: z.array(uuidString).optional(),
  start_date: z.string().max(MAX_COLOR_LENGTH).nullish(),
  task_name: z.string().trim().min(1).max(MAX_TASK_NAME_LENGTH).optional(),
  title: z.string().trim().min(1).max(MAX_TASK_NAME_LENGTH).optional(),
});

export const saveTaskTemplateFromTaskSchema = z.object({
  key: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(MAX_TASK_NAME_LENGTH).optional(),
  slug: z.string().trim().min(1).max(120).optional(),
  taskId: uuidString.optional(),
  task_id: uuidString.optional(),
  visibility: visibilitySchema.default('private'),
});

export interface TaskTemplateRow {
  archived_at: string | null;
  assignee_ids: string[];
  created_at: string;
  created_by: string;
  default_board_id: string | null;
  default_list_id: string | null;
  description: string | null;
  description_yjs_state: number[] | null;
  end_date: string | null;
  estimation_points: number | null;
  id: string;
  label_ids: string[];
  name: string;
  priority: TaskPriority | null;
  project_ids: string[];
  slug: string;
  source_task_id: string | null;
  start_date: string | null;
  task_name: string;
  updated_at: string;
  visibility: 'private' | 'workspace';
  ws_id: string;
}

export type SerializedTaskTemplate = TaskTemplateRow & {
  isOwner: boolean;
};

export interface TaskTemplatesRouteContext {
  canManageWorkspaceTemplates: boolean;
  sbAdmin: TypedSupabaseClient;
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
  wsId: string;
}

type UntypedQueryBuilder = {
  delete: () => UntypedQueryBuilder;
  eq: (column: string, value: unknown) => UntypedQueryBuilder;
  ilike: (column: string, pattern: string) => UntypedQueryBuilder;
  insert: (payload: unknown) => UntypedQueryBuilder;
  in: (column: string, values: unknown[]) => UntypedQueryBuilder;
  is: (column: string, value: unknown) => UntypedQueryBuilder;
  limit: (count: number) => UntypedQueryBuilder;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  not: (
    column: string,
    operator: string,
    value: unknown
  ) => UntypedQueryBuilder;
  or: (filters: string) => UntypedQueryBuilder;
  order: (column: string, options?: unknown) => UntypedQueryBuilder;
  select: (columns?: string, options?: unknown) => UntypedQueryBuilder;
  single: () => Promise<{ data: unknown; error: unknown }>;
  update: (payload: unknown) => UntypedQueryBuilder;
};

function fromUntyped(sbAdmin: TypedSupabaseClient, table: string) {
  return (
    sbAdmin as unknown as {
      from: (tableName: string) => UntypedQueryBuilder;
    }
  ).from(table);
}

export function taskTemplatesTable(sbAdmin: TypedSupabaseClient) {
  return fromUntyped(sbAdmin, 'task_templates');
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function normalizeTemplateSlug(value: string) {
  const normalized = slugify(value);
  if (!normalized) {
    throw new Error('Task template key must contain a letter or number');
  }
  return normalized;
}

export function serializeTaskTemplate(
  row: TaskTemplateRow,
  userId: string
): SerializedTaskTemplate {
  return {
    ...row,
    assignee_ids: Array.isArray(row.assignee_ids) ? row.assignee_ids : [],
    label_ids: Array.isArray(row.label_ids) ? row.label_ids : [],
    project_ids: Array.isArray(row.project_ids) ? row.project_ids : [],
    isOwner: row.created_by === userId,
  };
}

export function jsonError(error: string, status: number, code?: string) {
  return NextResponse.json(
    {
      ...(code ? { code } : {}),
      error,
    },
    { status }
  );
}

export function handleUnknownTaskTemplateError(error: unknown, label: string) {
  if (error instanceof z.ZodError) {
    return jsonError(error.message, 400);
  }

  if (error instanceof Error && error.message.includes('letter or number')) {
    return jsonError(error.message, 400);
  }

  console.error(label, error);
  return jsonError('Internal server error', 500);
}

export function isUniqueViolation(error: unknown) {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '23505'
  );
}

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new z.ZodError([
      {
        code: 'custom',
        input: undefined,
        message: 'Malformed JSON body',
        path: [],
      },
    ]);
  }
}

export async function createTaskTemplatesRouteContext(
  auth: SessionAuthContext,
  rawWsId: string
): Promise<TaskTemplatesRouteContext | NextResponse> {
  const wsId = await normalizeWorkspaceId(rawWsId, auth.supabase);

  const memberCheck = await verifyWorkspaceMembershipType({
    supabase: auth.supabase,
    userId: auth.user.id,
    wsId,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return jsonError('Failed to verify workspace access', 500);
  }

  if (!memberCheck.ok) {
    return jsonError('Workspace access denied', 403);
  }

  const permissions = await getPermissions({ user: auth.user, wsId });
  const canManageWorkspaceTemplates =
    permissions?.containsPermission('manage_projects') ?? false;

  const sbAdmin = await createAdminClient({ noCookie: true });

  return {
    canManageWorkspaceTemplates,
    sbAdmin,
    supabase: auth.supabase,
    user: auth.user,
    wsId,
  };
}

export function requireWorkspaceTemplateMutation(
  context: TaskTemplatesRouteContext,
  visibility: 'private' | 'workspace' | null | undefined
) {
  if (visibility !== 'workspace' || context.canManageWorkspaceTemplates) {
    return null;
  }

  return jsonError(
    "You don't have permission to manage workspace task templates",
    403
  );
}

export function buildTaskTemplateInsert(
  parsed: z.infer<typeof createTaskTemplateSchema>,
  context: TaskTemplatesRouteContext
) {
  const taskName = parsed.task_name ?? parsed.title ?? parsed.name;
  const slug = normalizeTemplateSlug(parsed.slug ?? parsed.key ?? parsed.name);

  return {
    assignee_ids: parsed.assignee_ids,
    created_by: context.user.id,
    default_board_id: parsed.default_board_id ?? null,
    default_list_id: parsed.default_list_id ?? null,
    description: parsed.description ?? null,
    description_yjs_state: parsed.description_yjs_state ?? null,
    end_date: parsed.end_date ?? null,
    estimation_points: parsed.estimation_points ?? null,
    label_ids: parsed.label_ids,
    name: parsed.name,
    priority: parsed.priority ?? null,
    project_ids: parsed.project_ids,
    slug,
    source_task_id: parsed.source_task_id ?? null,
    start_date: parsed.start_date ?? null,
    task_name: taskName,
    visibility: parsed.visibility,
    ws_id: context.wsId,
  };
}

export function buildTaskTemplateUpdate(
  parsed: z.infer<typeof updateTaskTemplateSchema>
) {
  const update: Record<string, unknown> = {};

  if (parsed.assignee_ids !== undefined)
    update.assignee_ids = parsed.assignee_ids;
  if (parsed.default_board_id !== undefined) {
    update.default_board_id = parsed.default_board_id ?? null;
  }
  if (parsed.default_list_id !== undefined) {
    update.default_list_id = parsed.default_list_id ?? null;
  }
  if (parsed.description !== undefined)
    update.description = parsed.description ?? null;
  if (parsed.description_yjs_state !== undefined) {
    update.description_yjs_state = parsed.description_yjs_state ?? null;
  }
  if (parsed.end_date !== undefined) update.end_date = parsed.end_date ?? null;
  if (parsed.estimation_points !== undefined) {
    update.estimation_points = parsed.estimation_points ?? null;
  }
  if (parsed.label_ids !== undefined) update.label_ids = parsed.label_ids;
  if (parsed.name !== undefined) update.name = parsed.name;
  if (parsed.priority !== undefined) update.priority = parsed.priority ?? null;
  if (parsed.project_ids !== undefined) update.project_ids = parsed.project_ids;
  if (parsed.slug !== undefined || parsed.key !== undefined) {
    update.slug = normalizeTemplateSlug(parsed.slug ?? parsed.key ?? '');
  }
  if (parsed.source_task_id !== undefined) {
    update.source_task_id = parsed.source_task_id ?? null;
  }
  if (parsed.start_date !== undefined) {
    update.start_date = parsed.start_date ?? null;
  }
  if (
    parsed.task_name !== undefined ||
    parsed.title !== undefined ||
    (parsed.name !== undefined && parsed.task_name === undefined)
  ) {
    update.task_name = parsed.task_name ?? parsed.title ?? parsed.name;
  }
  if (parsed.visibility !== undefined) update.visibility = parsed.visibility;
  if (parsed.archived !== undefined) {
    update.archived_at = parsed.archived ? new Date().toISOString() : null;
  }

  return update;
}

export async function listTaskTemplates(
  request: NextRequest,
  context: TaskTemplatesRouteContext
) {
  const searchParams = request.nextUrl.searchParams;
  const includeArchived = searchParams.get('includeArchived') === 'true';
  const visibility = visibilitySchema
    .optional()
    .safeParse(searchParams.get('visibility') ?? undefined);
  const q = searchParams.get('q')?.trim();

  let query = taskTemplatesTable(context.sbAdmin)
    .select('*')
    .eq('ws_id', context.wsId)
    .or(`visibility.eq.workspace,created_by.eq.${context.user.id}`)
    .order('created_at', { ascending: false });

  if (!includeArchived) {
    query = query.is('archived_at', null);
  }

  if (visibility.success && visibility.data) {
    query = query.eq('visibility', visibility.data);
  }

  if (q) {
    const escaped = q.replace(/[%_]/g, '\\$&');
    query = query.or(
      `name.ilike.%${escaped}%,task_name.ilike.%${escaped}%,slug.ilike.%${escaped}%`
    );
  }

  const { data, error } = (await query) as unknown as {
    data: TaskTemplateRow[] | null;
    error: unknown;
  };

  if (error) {
    console.error('Failed to list task templates', error);
    return jsonError('Failed to list task templates', 500);
  }

  return NextResponse.json({
    templates: (data ?? []).map((row) =>
      serializeTaskTemplate(row, context.user.id)
    ),
  });
}

function isUuid(value: string) {
  return uuidString.safeParse(value).success;
}

export async function resolveTaskTemplate(
  context: TaskTemplatesRouteContext,
  templateKey: string,
  options: { includeArchived?: boolean } = {}
) {
  const decodedKey = decodeURIComponent(templateKey);
  const normalizedSlug = isUuid(decodedKey)
    ? null
    : normalizeTemplateSlug(decodedKey);

  let query = taskTemplatesTable(context.sbAdmin)
    .select('*')
    .eq('ws_id', context.wsId)
    .or(`visibility.eq.workspace,created_by.eq.${context.user.id}`)
    .limit(10);

  if (!options.includeArchived) {
    query = query.is('archived_at', null);
  }

  query = normalizedSlug
    ? query.eq('slug', normalizedSlug)
    : query.eq('id', decodedKey);

  const { data, error } = (await query) as unknown as {
    data: TaskTemplateRow[] | null;
    error: unknown;
  };

  if (error) {
    console.error('Failed to resolve task template', error);
    return { error: jsonError('Failed to resolve task template', 500) };
  }

  const templates = data ?? [];
  const template =
    templates.find((row) => row.created_by === context.user.id) ??
    templates.find((row) => row.visibility === 'workspace') ??
    null;

  if (!template) {
    return { error: jsonError('Task template not found', 404) };
  }

  return { template };
}

export async function createTaskTemplate(
  context: TaskTemplatesRouteContext,
  parsed: z.infer<typeof createTaskTemplateSchema>
) {
  const forbidden = requireWorkspaceTemplateMutation(
    context,
    parsed.visibility
  );
  if (forbidden) return forbidden;

  const { data, error } = (await taskTemplatesTable(context.sbAdmin)
    .insert(buildTaskTemplateInsert(parsed, context))
    .select('*')
    .single()) as { data: TaskTemplateRow | null; error: unknown };

  if (isUniqueViolation(error)) {
    return jsonError(
      'A task template with this key already exists',
      409,
      'TASK_TEMPLATE_KEY_EXISTS'
    );
  }

  if (error || !data) {
    console.error('Failed to create task template', error);
    return jsonError('Failed to create task template', 500);
  }

  return NextResponse.json(
    { template: serializeTaskTemplate(data, context.user.id) },
    { status: 201 }
  );
}

export async function resolveDefaultTemplateListId(
  context: TaskTemplatesRouteContext,
  template: TaskTemplateRow,
  requestedListId?: string
) {
  const listId = requestedListId ?? template.default_list_id ?? null;
  if (listId) {
    const { data, error } = (await context.sbAdmin
      .from('task_lists')
      .select('id, board_id, workspace_boards!inner(id, ws_id, deleted_at)')
      .eq('id', listId)
      .eq('deleted', false)
      .maybeSingle()) as { data: unknown; error: unknown };

    const row = data as {
      workspace_boards?: {
        deleted_at?: string | null;
        ws_id?: string | null;
      } | null;
    } | null;

    if (
      error ||
      !row ||
      row.workspace_boards?.ws_id !== context.wsId ||
      row.workspace_boards?.deleted_at
    ) {
      return {
        error: jsonError('Task list not found for this workspace', 404),
      };
    }

    return { listId };
  }

  if (!template.default_board_id) {
    return {
      error: jsonError('A task list is required to use this template', 400),
    };
  }

  const { data: board, error: boardError } = await context.sbAdmin
    .from('workspace_boards')
    .select('id, default_list_id')
    .eq('id', template.default_board_id)
    .eq('ws_id', context.wsId)
    .is('deleted_at', null)
    .maybeSingle();

  if (boardError || !board) {
    return { error: jsonError('Template default board was not found', 404) };
  }

  if (board.default_list_id) {
    return { listId: board.default_list_id };
  }

  const { data: firstList, error: firstListError } = await context.sbAdmin
    .from('task_lists')
    .select('id')
    .eq('board_id', template.default_board_id)
    .eq('deleted', false)
    .order('position', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (firstListError || !firstList) {
    return {
      error: jsonError('Template default board has no active lists', 400),
    };
  }

  return { listId: firstList.id };
}

export async function instantiateTaskTemplate(
  context: TaskTemplatesRouteContext,
  template: TaskTemplateRow,
  parsed: z.infer<typeof instantiateTaskTemplateSchema>
) {
  const list = await resolveDefaultTemplateListId(
    context,
    template,
    parsed.listId ?? parsed.list_id
  );

  if (list.error) return list.error;

  const taskPayload = {
    assignee_ids: parsed.assignee_ids ?? template.assignee_ids ?? [],
    description:
      parsed.description !== undefined
        ? (parsed.description ?? undefined)
        : (template.description ?? undefined),
    description_yjs_state:
      parsed.description_yjs_state !== undefined
        ? (parsed.description_yjs_state ?? undefined)
        : (template.description_yjs_state ?? undefined),
    end_date:
      parsed.end_date !== undefined
        ? (parsed.end_date ?? null)
        : template.end_date,
    estimation_points:
      parsed.estimation_points !== undefined
        ? (parsed.estimation_points ?? null)
        : template.estimation_points,
    label_ids: parsed.label_ids ?? template.label_ids ?? [],
    name: parsed.task_name ?? parsed.title ?? parsed.name ?? template.task_name,
    priority:
      parsed.priority !== undefined
        ? (parsed.priority ?? null)
        : template.priority,
    project_ids: parsed.project_ids ?? template.project_ids ?? [],
    start_date:
      parsed.start_date !== undefined
        ? (parsed.start_date ?? undefined)
        : (template.start_date ?? undefined),
    listId: list.listId,
  };

  const taskRequest = new Request(
    `https://tuturuuu.internal/api/v1/workspaces/${encodeURIComponent(context.wsId)}/tasks`,
    {
      body: JSON.stringify(taskPayload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  ) as NextRequest;
  const taskAuth: TaskRouteAuthContext = {
    supabase: context.supabase,
    user: context.user,
  };
  const taskResponse = await handleTaskRoutePOST(
    taskRequest,
    { params: Promise.resolve({ wsId: context.wsId }) },
    taskAuth
  );
  const taskData = await taskResponse.json().catch(() => ({}));

  if (!taskResponse.ok) {
    return NextResponse.json(taskData, { status: taskResponse.status });
  }

  return NextResponse.json({
    task: taskData.task ?? taskData,
    template: serializeTaskTemplate(template, context.user.id),
  });
}
