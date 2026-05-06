import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database, TaskActorRpcArgs } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import {
  MAX_COLOR_LENGTH,
  MAX_TASK_DESCRIPTION_LENGTH,
  MAX_TASK_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import {
  calculateTopSortKey,
  getPersonalExternalStagingBoardId,
  getPersonalExternalStagingListId,
} from '@tuturuuu/utils/task-helper';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { deriveTaskDescriptionYjsState } from '@tuturuuu/utils/yjs-task-description';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateTaskEmbedding } from './generate-task-embedding';
import {
  buildTaskRelationshipSummary,
  normalizeTask,
  type TaskRecord,
  type TaskRelationshipSummary,
} from './get-tasks-helpers';
import {
  applyPersonalTaskMetadata,
  loadPersonalTaskMetadata,
} from './personal-overlays';

async function cleanupCreatedTask(
  sbAdmin: TypedSupabaseClient,
  taskId: string
) {
  const cleanupOperations = [
    sbAdmin
      .from('task_user_scheduling_settings')
      .delete()
      .eq('task_id', taskId),
    sbAdmin.from('task_assignees').delete().eq('task_id', taskId),
    sbAdmin.from('task_project_tasks').delete().eq('task_id', taskId),
    sbAdmin.from('task_labels').delete().eq('task_id', taskId),
  ];

  const cleanupResults = await Promise.all(cleanupOperations);

  for (const result of cleanupResults) {
    if (result.error) {
      console.error(
        'Failed to clean up task relation during rollback:',
        result.error
      );
    }
  }

  const { error: taskCleanupError } = await sbAdmin
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (taskCleanupError) {
    console.error('Failed to roll back created task:', taskCleanupError);
  }
}

const CreateTaskSchema = z.object({
  name: z.string().min(1).max(MAX_TASK_NAME_LENGTH),
  description: z
    .string()
    .max(MAX_TASK_DESCRIPTION_LENGTH)
    .nullable()
    .optional(),
  description_yjs_state: z
    .array(z.number().int().min(0).max(255))
    .nullable()
    .optional(),
  listId: z.guid(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).nullable().optional(),
  start_date: z.string().max(MAX_COLOR_LENGTH).nullable().optional(),
  end_date: z.string().max(MAX_COLOR_LENGTH).nullable().optional(),
  estimation_points: z.number().nullable().optional(),
  label_ids: z.array(z.guid()).optional(),
  project_ids: z.array(z.guid()).optional(),
  assignee_ids: z.array(z.guid()).optional(),
  total_duration: z.number().nonnegative().nullable().optional(),
  is_splittable: z.boolean().nullable().optional(),
  min_split_duration_minutes: z.number().int().min(0).nullable().optional(),
  max_split_duration_minutes: z.number().int().min(0).nullable().optional(),
  calendar_hours: z.string().nullable().optional(),
  auto_schedule: z.boolean().nullable().optional(),
});
type TaskInsert = Database['public']['Tables']['tasks']['Insert'];

function parseTaskIdentifierQuery(identifier: string) {
  const normalized = identifier.trim().toUpperCase();

  if (!normalized) {
    return null;
  }

  if (/^\d+$/.test(normalized)) {
    return {
      displayNumber: Number.parseInt(normalized, 10),
      ticketPrefix: null,
    };
  }

  const match = normalized.match(/^([A-Z][A-Z0-9_-]*)-(\d+)$/);
  if (!match) {
    return null;
  }

  const [, ticketPrefix, displayNumber] = match;
  if (!ticketPrefix || !displayNumber) {
    return null;
  }

  return {
    ticketPrefix,
    displayNumber: Number.parseInt(displayNumber, 10),
  };
}

type PersonalTaskPlacementRow = {
  task_id: string;
  personal_board_id: string;
  personal_list_id: string | null;
  personal_sort_key: number | null;
  personal_added_at: string | null;
  personal_placed_at: string | null;
};

type NormalizedRouteTask = Task & {
  assignee_ids?: string[];
  label_ids?: string[];
  project_ids?: string[];
  board_id?: string | null;
  board_name?: string | null;
  ticket_prefix?: string | null;
  task_lists?: TaskRecord['task_lists'];
};

type ExternalTaskSortBy =
  | 'created-desc'
  | 'created-asc'
  | 'due-asc'
  | 'name-asc'
  | 'source-asc';
type ExternalSourceStatus =
  | 'not_started'
  | 'active'
  | 'documents'
  | 'done'
  | 'closed';

const DEFAULT_EXTERNAL_TASK_SORT_BY: ExternalTaskSortBy = 'created-desc';
const ACTIVE_EXTERNAL_SOURCE_STATUSES: ExternalSourceStatus[] = [
  'not_started',
  'active',
];
const DOCUMENT_EXTERNAL_SOURCE_STATUS: ExternalSourceStatus = 'documents';
const TERMINAL_EXTERNAL_SOURCE_STATUSES: ExternalSourceStatus[] = [
  'done',
  'closed',
];

function parseExternalTaskSortBy(value: string | null): ExternalTaskSortBy {
  switch (value) {
    case 'created-asc':
    case 'due-asc':
    case 'name-asc':
    case 'source-asc':
      return value;
    default:
      return DEFAULT_EXTERNAL_TASK_SORT_BY;
  }
}

function getTaskSourceLocation(task: TaskRecord) {
  const taskList = task.task_lists as
    | {
        id?: string | null;
        name?: string | null;
        status?: string | null;
        workspace_boards?: {
          id?: string | null;
          name?: string | null;
          ws_id?: string | null;
          workspaces?: {
            name?: string | null;
          } | null;
        } | null;
      }
    | null
    | undefined;

  return {
    list: taskList,
    board: taskList?.workspace_boards ?? null,
    workspace: taskList?.workspace_boards?.workspaces ?? null,
  };
}

async function loadAccessibleWorkspaceIds(
  supabase: TypedSupabaseClient,
  userId: string,
  workspaceIds: string[]
) {
  const uniqueWorkspaceIds = [...new Set(workspaceIds.filter(Boolean))];

  if (uniqueWorkspaceIds.length === 0) {
    return new Set<string>();
  }

  const { data: memberships, error } = await supabase
    .from('workspace_members')
    .select('ws_id')
    .eq('user_id', userId)
    .in('ws_id', uniqueWorkspaceIds);

  if (error) {
    throw new Error('SOURCE_WORKSPACE_ACCESS_QUERY_FAILED');
  }

  return new Set(
    (memberships ?? [])
      .map((membership) => membership.ws_id)
      .filter((wsId): wsId is string => Boolean(wsId))
  );
}

function filterAccessibleExternalRecords(
  records: TaskRecord[],
  accessibleWorkspaceIds: Set<string>,
  personalWorkspaceId: string
) {
  return records.filter((task) => {
    const sourceWsId = getTaskSourceLocation(task).board?.ws_id;
    return (
      !!sourceWsId &&
      sourceWsId !== personalWorkspaceId &&
      accessibleWorkspaceIds.has(sourceWsId)
    );
  });
}

function applyPersonalExternalTask(
  task: TaskRecord,
  personalBoardId: string,
  placement?: PersonalTaskPlacementRow | null
) {
  const normalized = normalizeTask(task) as ReturnType<typeof normalizeTask> & {
    sort_key?: number | null;
  };
  const taskWithList = task as TaskRecord & { list_id?: string | null };
  const source = getTaskSourceLocation(task);
  const effectiveListId =
    placement?.personal_list_id ??
    getPersonalExternalStagingListId(personalBoardId);

  return {
    ...normalized,
    source_workspace_id: source.board?.ws_id ?? null,
    source_workspace_name: source.workspace?.name ?? null,
    source_board_id: source.board?.id ?? null,
    source_board_name: source.board?.name ?? null,
    source_list_id: source.list?.id ?? taskWithList.list_id ?? null,
    source_list_name: source.list?.name ?? null,
    source_list_status: source.list?.status ?? null,
    personal_board_id: personalBoardId,
    personal_list_id: placement?.personal_list_id ?? null,
    personal_sort_key: placement?.personal_sort_key ?? null,
    personal_added_at: placement?.personal_added_at ?? null,
    personal_placed_at: placement?.personal_placed_at ?? null,
    is_personal_external: true,
    is_personal_external_default: !placement,
    list_id: effectiveListId,
    sort_key: placement?.personal_sort_key ?? normalized.sort_key ?? null,
  } as unknown as NormalizedRouteTask;
}

function applyPersonalPlacement(
  task: TaskRecord,
  placement: PersonalTaskPlacementRow
) {
  return applyPersonalExternalTask(
    task,
    placement.personal_board_id,
    placement
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(request);
    const normalizedWorkspaceId = await normalizeWorkspaceId(wsId, supabase);

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWorkspaceId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    const url = new URL(request.url);

    const parsedLimit = Number.parseInt(
      url.searchParams.get('limit') ?? '',
      10
    );
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 200)
        : 100;

    const parsedOffset = Number.parseInt(
      url.searchParams.get('offset') ?? '',
      10
    );
    const offset =
      Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
    const boardId = url.searchParams.get('boardId');
    const listId = url.searchParams.get('listId');
    const searchQuery = url.searchParams.get('q')?.trim();
    const identifierQuery = url.searchParams.get('identifier')?.trim();
    const includeRelationshipSummaryParam = url.searchParams.get(
      'includeRelationshipSummary'
    );
    const includeRelationshipSummary =
      includeRelationshipSummaryParam !== 'false';
    const includeDeletedParam = url.searchParams.get('includeDeleted');
    const includeDeletedMode =
      includeDeletedParam === 'only'
        ? 'only'
        : includeDeletedParam === 'all'
          ? 'all'
          : 'none';
    const includeCount = url.searchParams.get('includeCount') === 'true';
    const assignedToMe = url.searchParams.get('assignedToMe') === 'true';
    const completedMode = url.searchParams.get('completed');
    const closedMode = url.searchParams.get('closed');
    const externalIncludeDocuments =
      url.searchParams.get('externalIncludeDocuments') === 'true';
    const externalIncludeDoneClosed =
      url.searchParams.get('externalIncludeDoneClosed') === 'true' ||
      completedMode === 'only' ||
      closedMode === 'only';
    const externalSortBy = parseExternalTaskSortBy(
      url.searchParams.get('externalSortBy')
    );
    const virtualStagingBoardId = listId
      ? getPersonalExternalStagingBoardId(listId)
      : null;
    const sourceTasksDisabled = Boolean(virtualStagingBoardId);

    const forTimeTracking = url.searchParams.get('forTimeTracking') === 'true';

    const { data: workspaceRow, error: workspaceError } = await sbAdmin
      .from('workspaces')
      .select('personal')
      .eq('id', normalizedWorkspaceId)
      .maybeSingle();

    if (workspaceError) {
      return NextResponse.json(
        { error: 'Failed to validate workspace' },
        { status: 500 }
      );
    }

    const isPersonalWorkspace = workspaceRow?.personal === true;

    const timeTrackingSelect = `
        id,
        display_number,
        name,
        priority,
        start_date,
        end_date,
        list_id,
        task_lists!inner (
          id,
          name,
          status,
          color,
          deleted,
          board_id,
          workspace_boards!inner (
            id,
            name,
            ticket_prefix,
            ws_id,
            workspaces!inner (
              id,
              name,
              personal
            )
          )
        ),
        assignees:task_assignees(
          user_id
        )
      `;

    const timeTrackingSelectAssignedToMe = `
        id,
        display_number,
        name,
        priority,
        start_date,
        end_date,
        list_id,
        task_lists!inner (
          id,
          name,
          status,
          color,
          deleted,
          board_id,
          workspace_boards!inner (
            id,
            name,
            ticket_prefix,
            ws_id,
            workspaces!inner (
              id,
              name,
              personal
            )
          )
        ),
        _currentUserAssignment:task_assignees!inner(
          user_id
        ),
        assignees:task_assignees(
          user_id
        )
      `;

    const fullSelect = `
        id,
        display_number,
        name,
        description,
        priority,
        completed,
        completed_at,
        sort_key,
        start_date,
        end_date,
        estimation_points,
        created_at,
        list_id,
        closed_at,
        task_lists!inner (
          id,
          name,
          status,
          color,
          deleted,
          board_id,
          workspace_boards!inner (
            id,
            name,
            ticket_prefix,
            ws_id,
            workspaces (
              name
            )
          )
        ),
        assignees:task_assignees(
          user_id,
          user:users(
            id,
            display_name,
            avatar_url
          )
        ),
        labels:task_labels(
          label:workspace_task_labels(
            id,
            name,
            color,
            created_at
          )
        ),
        projects:task_project_tasks(
          project:task_projects(
            id,
            name,
            status
          )
        )
      `;

    const fullSelectAssignedToMe = `
        id,
        display_number,
        name,
        description,
        priority,
        completed,
        completed_at,
        sort_key,
        start_date,
        end_date,
        estimation_points,
        created_at,
        list_id,
        closed_at,
        task_lists!inner (
          id,
          name,
          status,
          color,
          deleted,
          board_id,
          workspace_boards!inner (
            id,
            name,
            ticket_prefix,
            ws_id,
            workspaces (
              name
            )
          )
        ),
        _currentUserAssignment:task_assignees!inner(
          user_id
        ),
        assignees:task_assignees(
          user_id,
          user:users(
            id,
            display_name,
            avatar_url
          )
        ),
        labels:task_labels(
          label:workspace_task_labels(
            id,
            name,
            color,
            created_at
          )
        ),
        projects:task_project_tasks(
          project:task_projects(
            id,
            name,
            status
          )
        )
      `;

    const selectedColumns = forTimeTracking
      ? assignedToMe
        ? timeTrackingSelectAssignedToMe
        : timeTrackingSelect
      : assignedToMe
        ? fullSelectAssignedToMe
        : fullSelect;

    let query = sbAdmin
      .from('tasks')
      .select(selectedColumns, includeCount ? { count: 'exact' } : undefined)
      .eq('task_lists.workspace_boards.ws_id', normalizedWorkspaceId);

    if (includeDeletedMode === 'none') {
      query = query.is('deleted_at', null).eq('task_lists.deleted', false);
    } else if (includeDeletedMode === 'only') {
      query = query.not('deleted_at', 'is', null) as typeof query;
    }

    if (forTimeTracking) {
      query = query
        .is('closed_at', null)
        .in('task_lists.status', ['not_started', 'active']);
    }

    if (completedMode === 'exclude') {
      query = query.is('completed_at', null);
    } else if (completedMode === 'only') {
      query = query.not('completed_at', 'is', null) as typeof query;
    }

    if (closedMode === 'exclude') {
      query = query.is('closed_at', null);
    } else if (closedMode === 'only') {
      query = query.not('closed_at', 'is', null) as typeof query;
    }

    if (assignedToMe) {
      query = query.eq('_currentUserAssignment.user_id', user.id);
    }

    if (sourceTasksDisabled) {
      query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    } else if (listId) {
      query = query.eq('list_id', listId);
    } else if (boardId) {
      query = query.eq('task_lists.board_id', boardId);
    }

    if (searchQuery) {
      query = query.ilike('name', `%${searchQuery}%`);
    }

    const parsedIdentifier = identifierQuery
      ? parseTaskIdentifierQuery(identifierQuery)
      : null;

    if (parsedIdentifier) {
      query = query.eq('display_number', parsedIdentifier.displayNumber);

      if (parsedIdentifier.ticketPrefix) {
        query = query.eq(
          'task_lists.workspace_boards.ticket_prefix',
          parsedIdentifier.ticketPrefix
        );
      }
    }

    const queryResult = await query
      .order('sort_key', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = queryResult as unknown as {
      data: TaskRecord[] | null;
      error: unknown;
      count: number | null;
    };

    if (error) {
      console.error('Database error in tasks query:', error);
      throw new Error('TASKS_QUERY_FAILED');
    }

    const sourceTasks = (data?.map(normalizeTask) ??
      []) as unknown as NormalizedRouteTask[];
    let externalTasks: NormalizedRouteTask[] = [];
    let externalTaskCount = 0;

    if (
      isPersonalWorkspace &&
      !forTimeTracking &&
      (boardId || listId || virtualStagingBoardId)
    ) {
      const targetPersonalBoardId = boardId ?? virtualStagingBoardId;
      let placements: PersonalTaskPlacementRow[] = [];

      let placementQuery = targetPersonalBoardId
        ? (sbAdmin as any)
            .from('task_user_overrides')
            .select(
              'task_id, personal_board_id, personal_list_id, personal_sort_key, personal_added_at, personal_placed_at',
              includeCount ? { count: 'exact' } : undefined
            )
            .eq('user_id', user.id)
            .eq('personal_board_id', targetPersonalBoardId)
        : null;

      if (placementQuery) {
        if (virtualStagingBoardId) {
          placementQuery = placementQuery.is('personal_list_id', null);
        } else if (listId) {
          placementQuery = placementQuery.eq('personal_list_id', listId);
        }

        placementQuery = placementQuery
          .order('personal_sort_key', {
            ascending: true,
            nullsFirst: false,
          })
          .order('personal_added_at', { ascending: true });

        if (listId && !virtualStagingBoardId) {
          placementQuery = placementQuery.range(offset, offset + limit - 1);
        }

        const placementResult = await placementQuery;

        if (placementResult.error) {
          return NextResponse.json(
            { error: 'Failed to load personal task placements' },
            { status: 500 }
          );
        }

        placements =
          (placementResult.data as PersonalTaskPlacementRow[] | null) ?? [];
        externalTaskCount += placementResult.count ?? placements.length;
      }

      const placedTaskIds = placements.map((placement) => placement.task_id);
      const placedOnThisBoardTaskIds = new Set(
        placements
          .filter((placement) => placement.personal_list_id)
          .map((placement) => placement.task_id)
      );

      if (placedTaskIds.length > 0) {
        const { data: placedTaskRows, error: placedTasksError } = await sbAdmin
          .from('tasks')
          .select(fullSelect)
          .in('id', placedTaskIds)
          .is('deleted_at', null)
          .eq('task_lists.deleted', false)
          .is('task_lists.workspace_boards.deleted_at', null)
          .is('task_lists.workspace_boards.archived_at', null);

        if (placedTasksError) {
          return NextResponse.json(
            { error: 'Failed to load personal task placements' },
            { status: 500 }
          );
        }

        const placedRecords = (placedTaskRows ?? []) as TaskRecord[];
        const sourceWorkspaceIds = placedRecords
          .map((task) => getTaskSourceLocation(task).board?.ws_id)
          .filter((wsId): wsId is string => Boolean(wsId));

        let accessibleWorkspaceIds: Set<string>;
        try {
          accessibleWorkspaceIds = await loadAccessibleWorkspaceIds(
            supabase,
            user.id,
            sourceWorkspaceIds
          );
        } catch {
          return NextResponse.json(
            { error: 'Failed to verify source task access' },
            { status: 500 }
          );
        }

        const placedRecordById = new Map(
          filterAccessibleExternalRecords(
            placedRecords,
            accessibleWorkspaceIds,
            normalizedWorkspaceId
          ).map((record) => [record.id, record] as const)
        );

        externalTasks.push(
          ...placements.flatMap((placement) => {
            const task = placedRecordById.get(placement.task_id);
            return task ? [applyPersonalPlacement(task, placement)] : [];
          })
        );
      }

      const shouldLoadDefaultExternalTasks =
        !!targetPersonalBoardId && (!listId || !!virtualStagingBoardId);

      if (shouldLoadDefaultExternalTasks && targetPersonalBoardId) {
        let defaultExternalQuery = sbAdmin
          .from('tasks')
          .select(
            fullSelectAssignedToMe,
            includeCount ? { count: 'exact' } : undefined
          )
          .neq('task_lists.workspace_boards.ws_id', normalizedWorkspaceId)
          .is('deleted_at', null)
          .eq('_currentUserAssignment.user_id', user.id)
          .eq('task_lists.deleted', false)
          .is('task_lists.workspace_boards.deleted_at', null)
          .is('task_lists.workspace_boards.archived_at', null);

        const defaultExternalSourceStatuses: ExternalSourceStatus[] = [
          ...ACTIVE_EXTERNAL_SOURCE_STATUSES,
          ...(externalIncludeDocuments
            ? [DOCUMENT_EXTERNAL_SOURCE_STATUS]
            : []),
          ...(externalIncludeDoneClosed
            ? [...TERMINAL_EXTERNAL_SOURCE_STATUSES]
            : []),
        ];

        defaultExternalQuery = defaultExternalQuery.in(
          'task_lists.status',
          defaultExternalSourceStatuses
        );

        if (!externalIncludeDoneClosed) {
          defaultExternalQuery = defaultExternalQuery
            .is('completed_at', null)
            .is('closed_at', null);
        }

        if (completedMode === 'exclude') {
          defaultExternalQuery = defaultExternalQuery.is('completed_at', null);
        } else if (completedMode === 'only') {
          defaultExternalQuery = defaultExternalQuery.not(
            'completed_at',
            'is',
            null
          ) as typeof defaultExternalQuery;
        }

        if (closedMode === 'exclude') {
          defaultExternalQuery = defaultExternalQuery.is('closed_at', null);
        } else if (closedMode === 'only') {
          defaultExternalQuery = defaultExternalQuery.not(
            'closed_at',
            'is',
            null
          ) as typeof defaultExternalQuery;
        }

        if (searchQuery) {
          defaultExternalQuery = defaultExternalQuery.ilike(
            'name',
            `%${searchQuery}%`
          );
        }

        if (parsedIdentifier) {
          defaultExternalQuery = defaultExternalQuery.eq(
            'display_number',
            parsedIdentifier.displayNumber
          );

          if (parsedIdentifier.ticketPrefix) {
            defaultExternalQuery = defaultExternalQuery.eq(
              'task_lists.workspace_boards.ticket_prefix',
              parsedIdentifier.ticketPrefix
            );
          }
        }

        switch (externalSortBy) {
          case 'created-asc':
            defaultExternalQuery = defaultExternalQuery.order('created_at', {
              ascending: true,
            });
            break;
          case 'due-asc':
            defaultExternalQuery = defaultExternalQuery
              .order('end_date', { ascending: true, nullsFirst: false })
              .order('created_at', { ascending: false });
            break;
          case 'name-asc':
            defaultExternalQuery = defaultExternalQuery
              .order('name', { ascending: true })
              .order('created_at', { ascending: false });
            break;
          default:
            defaultExternalQuery = defaultExternalQuery.order('created_at', {
              ascending: false,
            });
            break;
        }

        const defaultExternalResult = await defaultExternalQuery.range(
          0,
          offset + limit - 1
        );

        if (defaultExternalResult.error) {
          return NextResponse.json(
            { error: 'Failed to load external tasks' },
            { status: 500 }
          );
        }

        const defaultExternalRecords = (
          (defaultExternalResult.data as TaskRecord[] | null) ?? []
        ).filter((record) => !placedOnThisBoardTaskIds.has(record.id));

        const sourceWorkspaceIds = defaultExternalRecords
          .map((task) => getTaskSourceLocation(task).board?.ws_id)
          .filter((wsId): wsId is string => Boolean(wsId));

        let accessibleWorkspaceIds: Set<string>;
        try {
          accessibleWorkspaceIds = await loadAccessibleWorkspaceIds(
            supabase,
            user.id,
            sourceWorkspaceIds
          );
        } catch {
          return NextResponse.json(
            { error: 'Failed to verify source task access' },
            { status: 500 }
          );
        }

        const placementByTaskId = new Map(
          placements.map((placement) => [placement.task_id, placement] as const)
        );
        const existingExternalTaskIds = new Set(
          externalTasks.map((task) => task.id)
        );
        const defaultExternalTasks = filterAccessibleExternalRecords(
          defaultExternalRecords,
          accessibleWorkspaceIds,
          normalizedWorkspaceId
        )
          .filter((task) => !existingExternalTaskIds.has(task.id))
          .map((task) =>
            applyPersonalExternalTask(
              task,
              targetPersonalBoardId,
              placementByTaskId.get(task.id) ?? null
            )
          );

        externalTasks.push(...defaultExternalTasks);
        externalTaskCount +=
          defaultExternalResult.count ?? defaultExternalTasks.length;
      }

      externalTaskCount = externalTasks.length;
      if (virtualStagingBoardId) {
        externalTasks = externalTasks.slice(offset, offset + limit);
      }

      if (externalTasks.length > 0) {
        try {
          const metadataByTaskId = await loadPersonalTaskMetadata(
            sbAdmin,
            user.id,
            externalTasks.map((task) => task.id)
          );

          externalTasks = externalTasks.map((task) =>
            applyPersonalTaskMetadata(task, metadataByTaskId.get(task.id))
          );
        } catch {
          return NextResponse.json(
            { error: 'Failed to load personal task metadata' },
            { status: 500 }
          );
        }
      }
    }

    const tasks = [...sourceTasks, ...externalTasks];

    const shouldIncludeRelationshipSummary =
      includeRelationshipSummary && !forTimeTracking;

    let relationshipSummaryByTaskId = new Map<
      string,
      TaskRelationshipSummary
    >();

    if (shouldIncludeRelationshipSummary) {
      const taskIds = tasks.map((task) => task.id).filter(Boolean);

      try {
        relationshipSummaryByTaskId = await buildTaskRelationshipSummary(
          sbAdmin,
          normalizedWorkspaceId,
          taskIds
        );
      } catch (relationshipError) {
        console.error(
          'Failed to load task relationship summaries:',
          relationshipError
        );
        return NextResponse.json(
          { error: 'Failed to load task relationships' },
          { status: 500 }
        );
      }
    }

    const tasksWithRelationshipSummary = tasks.map((task) => {
      const summary = relationshipSummaryByTaskId.get(task.id);
      const taskList = task.task_lists as
        | {
            board_id?: string | null;
            workspace_boards?: {
              name?: string | null;
              ticket_prefix?: string | null;
            } | null;
          }
        | null
        | undefined;
      return {
        ...task,
        board_id: task.board_id ?? taskList?.board_id ?? null,
        board_name: task.board_name ?? taskList?.workspace_boards?.name ?? null,
        ticket_prefix:
          task.ticket_prefix ??
          taskList?.workspace_boards?.ticket_prefix ??
          null,
        ...(shouldIncludeRelationshipSummary
          ? {
              relationship_summary: {
                parent_task_id: summary?.parentTaskId ?? null,
                parent_task: summary?.parentTask ?? null,
                child_count: summary?.childCount ?? 0,
                completed_child_count: summary?.completedChildCount ?? 0,
                blocked_by_count: summary?.blockedByCount ?? 0,
                blocking_count: summary?.blockingCount ?? 0,
                related_count: summary?.relatedCount ?? 0,
              },
            }
          : {}),
      };
    });

    return NextResponse.json({
      tasks: tasksWithRelationshipSummary,
      ...(includeCount ? { count: (count ?? 0) + externalTaskCount } : {}),
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(request);
    const normalizedWorkspaceId = await normalizeWorkspaceId(wsId, supabase);

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWorkspaceId,
      userId: user.id,
      supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const body = CreateTaskSchema.parse(await request.json());
    const {
      name,
      description,
      description_yjs_state,
      listId,
      priority,
      start_date,
      end_date,
      estimation_points,
      label_ids,
      project_ids,
      assignee_ids,
      total_duration,
      is_splittable,
      min_split_duration_minutes,
      max_split_duration_minutes,
      calendar_hours,
      auto_schedule,
    } = body;

    let normalizedAssigneeIds =
      assignee_ids && Array.isArray(assignee_ids)
        ? Array.from(new Set(assignee_ids))
        : undefined;
    const normalizedLabelIds =
      label_ids && Array.isArray(label_ids)
        ? Array.from(new Set(label_ids))
        : undefined;
    const normalizedProjectIds =
      project_ids && Array.isArray(project_ids)
        ? Array.from(new Set(project_ids))
        : undefined;

    const sbAdmin = await createAdminClient();
    const { data: listRow, error: listError } = await sbAdmin
      .from('task_lists')
      .select(
        `
        id,
        board_id,
        status,
        deleted,
        workspace_boards!inner(
          ws_id
        )
      `
      )
      .eq('id', listId)
      .maybeSingle();

    if (listError) {
      console.error('Error validating list:', listError);
      return NextResponse.json(
        { error: 'Failed to validate list' },
        { status: 500 }
      );
    }

    if (!listRow || listRow.workspace_boards?.ws_id !== normalizedWorkspaceId) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    if (listRow.deleted) {
      return NextResponse.json({ error: 'List is archived' }, { status: 400 });
    }

    if (normalizedAssigneeIds && normalizedAssigneeIds.length > 0) {
      const { data: members, error: membersError } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('ws_id', normalizedWorkspaceId)
        .in('user_id', normalizedAssigneeIds);

      if (membersError) {
        console.error('Error validating assignees:', membersError);
        return NextResponse.json(
          { error: 'Failed to validate task assignees' },
          { status: 500 }
        );
      }

      const validAssigneeIds = new Set(
        (members ?? []).map((member) => member.user_id)
      );

      normalizedAssigneeIds = normalizedAssigneeIds.filter((assigneeId) =>
        validAssigneeIds.has(assigneeId)
      );
    }

    if (normalizedLabelIds && normalizedLabelIds.length > 0) {
      const { data: labels, error: labelsError } = await supabase
        .from('workspace_task_labels')
        .select('id')
        .eq('ws_id', normalizedWorkspaceId)
        .in('id', normalizedLabelIds);

      if (labelsError) {
        console.error('Error validating labels:', labelsError);
        return NextResponse.json(
          { error: 'Failed to validate task labels' },
          { status: 500 }
        );
      }

      const validLabelIds = new Set((labels ?? []).map((label) => label.id));
      const hasInvalidLabel = normalizedLabelIds.some(
        (labelId) => !validLabelIds.has(labelId)
      );

      if (hasInvalidLabel) {
        return NextResponse.json(
          { error: 'One or more labels do not belong to this workspace' },
          { status: 400 }
        );
      }
    }

    if (normalizedProjectIds && normalizedProjectIds.length > 0) {
      const { data: projects, error: projectsError } = await sbAdmin
        .from('task_projects')
        .select('id')
        .eq('ws_id', normalizedWorkspaceId)
        .in('id', normalizedProjectIds);

      if (projectsError) {
        console.error('Error validating projects:', projectsError);
        return NextResponse.json(
          { error: 'Failed to validate task projects' },
          { status: 500 }
        );
      }

      const validProjectIds = new Set(
        (projects ?? []).map((project) => project.id)
      );
      const hasInvalidProject = normalizedProjectIds.some(
        (projectId) => !validProjectIds.has(projectId)
      );

      if (hasInvalidProject) {
        return NextResponse.json(
          { error: 'One or more projects do not belong to this workspace' },
          { status: 400 }
        );
      }
    }

    const { data: firstTask, error: firstTaskError } = await sbAdmin
      .from('tasks')
      .select('sort_key')
      .eq('list_id', listId)
      .is('deleted_at', null)
      .order('sort_key', { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (firstTaskError) {
      console.error('Error fetching first sort key:', firstTaskError);
      return NextResponse.json(
        { error: 'Failed to create task' },
        { status: 500 }
      );
    }

    const sort_key = calculateTopSortKey(firstTask?.sort_key ?? null);
    const now = new Date().toISOString();
    const isDoneList = listRow.status === 'done';
    const isClosedList = listRow.status === 'closed';
    const shouldArchive = isDoneList || isClosedList;
    const completionTimestamp = isDoneList ? now : null;
    const normalizedDescription = description?.trim() || null;
    const normalizedDescriptionYjsState =
      description_yjs_state === undefined
        ? deriveTaskDescriptionYjsState(normalizedDescription)
        : description_yjs_state;

    const taskInsert: TaskInsert = {
      name: name.trim(),
      description: normalizedDescription,
      creator_id: user.id,
      list_id: listId,
      priority: priority ?? null,
      start_date: start_date ?? null,
      end_date: end_date ?? null,
      estimation_points: estimation_points ?? null,
      sort_key,
      completed: isDoneList,
      completed_at: completionTimestamp,
      closed_at: shouldArchive ? now : null,
    };

    const { data, error } = await sbAdmin
      .from('tasks')
      .insert({
        ...taskInsert,
        description_yjs_state: normalizedDescriptionYjsState,
      })
      .select(
        `
        id,
        display_number,
        name,
        description,
        priority,
        completed,
        start_date,
        end_date,
        estimation_points,
        sort_key,
        created_at,
        list_id,
          task_lists!inner(
            id,
            name,
            workspace_boards!inner(
              name,
              ticket_prefix
            )
          )
        `
      )
      .maybeSingle();

    if (error) {
      console.error('Error creating task:', error);
      return NextResponse.json(
        { error: 'Failed to create task' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Failed to create task' },
        { status: 500 }
      );
    }

    if (
      normalizedLabelIds !== undefined ||
      normalizedProjectIds !== undefined ||
      normalizedAssigneeIds !== undefined
    ) {
      const relationPayload: TaskActorRpcArgs<'update_task_with_relations'> = {
        p_task_id: data.id,
        p_task_updates: {},
        p_assignee_ids: normalizedAssigneeIds,
        p_replace_assignees: normalizedAssigneeIds !== undefined,
        p_label_ids: normalizedLabelIds,
        p_replace_labels: normalizedLabelIds !== undefined,
        p_project_ids: normalizedProjectIds,
        p_replace_projects: normalizedProjectIds !== undefined,
        p_actor_user_id: user.id,
      };
      const { error: relationError } = await sbAdmin.rpc(
        'update_task_with_relations',
        relationPayload
      );

      if (relationError) {
        console.error('Failed to attach task relationships:', relationError);
        await cleanupCreatedTask(sbAdmin, data.id);
        return NextResponse.json(
          { error: 'Failed to attach task relationships' },
          { status: 500 }
        );
      }
    }

    const hasSchedulingInput =
      total_duration !== undefined ||
      is_splittable !== undefined ||
      min_split_duration_minutes !== undefined ||
      max_split_duration_minutes !== undefined ||
      calendar_hours !== undefined ||
      auto_schedule !== undefined;

    if (hasSchedulingInput) {
      const { error: schedulingError } = await sbAdmin
        .from('task_user_scheduling_settings')
        .upsert(
          [
            {
              task_id: data.id,
              user_id: user.id,
              total_duration: total_duration ?? null,
              is_splittable: is_splittable ?? false,
              min_split_duration_minutes: min_split_duration_minutes ?? null,
              max_split_duration_minutes: max_split_duration_minutes ?? null,
              calendar_hours:
                (calendar_hours as
                  | Database['public']['Tables']['task_user_scheduling_settings']['Insert']['calendar_hours']
                  | null
                  | undefined) ?? null,
              auto_schedule: auto_schedule ?? false,
            },
          ],
          {
            onConflict: 'task_id,user_id',
          }
        );

      if (schedulingError) {
        console.error(
          'Failed to persist task scheduling settings:',
          schedulingError
        );
        await cleanupCreatedTask(sbAdmin, data.id);
        return NextResponse.json(
          { error: 'Failed to create task scheduling settings' },
          { status: 500 }
        );
      }
    }

    generateTaskEmbedding({
      taskId: data.id,
      taskName: data.name,
      taskDescription: data.description,
      supabase: sbAdmin,
    }).catch((err) => {
      console.error('Failed to generate embedding in background:', err);
    });

    const task = {
      id: data.id,
      display_number: data.display_number,
      name: data.name,
      description: data.description,
      priority: data.priority,
      completed: data.completed,
      start_date: data.start_date,
      end_date: data.end_date,
      estimation_points: data.estimation_points,
      sort_key: data.sort_key,
      created_at: data.created_at,
      list_id: data.list_id,
      board_name: data.task_lists?.workspace_boards?.name,
      ticket_prefix: data.task_lists?.workspace_boards?.ticket_prefix,
      list_name: data.task_lists?.name,
    };

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
