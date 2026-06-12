import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export const BOARD_TASK_REALTIME_CHANNEL_PREFIX = 'board-realtime';
export const TASK_USER_REALTIME_CHANNEL_PREFIX = 'task-user-realtime';

export type TaskRealtimeEvent =
  | 'task:upsert'
  | 'task:delete'
  | 'task:relations-changed'
  | 'task:deps-changed'
  | 'list:upsert'
  | 'list:delete';

type BroadcastLogFn = (message: string, data?: unknown) => void;

type TaskSourceContext = {
  taskId: string;
  sourceBoardId: string | null;
  sourceBoardName: string | null;
  sourceListId: string | null;
  sourceWorkspaceId: string | null;
  ticketPrefix: string | null;
};

type PersonalTaskPlacement = {
  task_id: string;
  user_id: string;
  personal_board_id: string | null;
  personal_list_id: string | null;
};

type TaskSourceRow = {
  id: string;
  list_id: string | null;
  task_lists: {
    board_id: string | null;
    workspace_boards: {
      id: string;
      name: string | null;
      ws_id: string | null;
      ticket_prefix: string | null;
    } | null;
  } | null;
};

type TaskPlacementRow = {
  task_id: string | null;
  user_id: string | null;
  personal_board_id: string | null;
  personal_list_id: string | null;
};

export type TaskRealtimeFanoutContext = {
  sourcesByTaskId: Map<string, TaskSourceContext>;
  placementsByTaskId: Map<string, PersonalTaskPlacement[]>;
  boardIds: string[];
  userIds: string[];
};

export type PublishTaskRealtimeOptions = {
  sbAdmin: TypedSupabaseClient;
  event: TaskRealtimeEvent;
  taskIds: string[];
  actorUserId?: string | null;
  taskPayloadsById?: Map<string, Record<string, unknown>>;
  payload?: Record<string, unknown>;
  logWarning?: BroadcastLogFn;
};

export type PublishBoardListRealtimeOptions = {
  actorUserId?: string | null;
  boardId: string;
  event: Extract<TaskRealtimeEvent, 'list:upsert' | 'list:delete'>;
  list?: Record<string, unknown>;
  listId?: string | null;
  logWarning?: BroadcastLogFn;
  payload?: Record<string, unknown>;
  sbAdmin: TypedSupabaseClient;
};

const normalizeStringIds = (
  values: Iterable<string | null | undefined>
): string[] => [
  ...new Set(
    [...values].filter(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0
    )
  ),
];

function createTaskRealtimeEventId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `server-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function taskUserRealtimeChannelName(userId: string) {
  return `${TASK_USER_REALTIME_CHANNEL_PREFIX}-${userId}`;
}

function boardRealtimeChannelName(boardId: string) {
  return `${BOARD_TASK_REALTIME_CHANNEL_PREFIX}-${boardId}`;
}

async function sendTaskBroadcast({
  sbAdmin,
  channelNames,
  event,
  payload,
  logWarning,
}: {
  sbAdmin: TypedSupabaseClient;
  channelNames: string[];
  event: string;
  payload: Record<string, unknown>;
  logWarning?: BroadcastLogFn;
}) {
  if (
    typeof sbAdmin.channel !== 'function' ||
    typeof sbAdmin.removeChannel !== 'function'
  ) {
    logWarning?.('Task realtime broadcast skipped: channel API unavailable', {
      channelNames,
      event,
    });
    return;
  }

  await Promise.all(
    channelNames.map(async (channelName) => {
      const channel = sbAdmin.channel(channelName);
      try {
        await channel.send({
          type: 'broadcast',
          event,
          payload,
        });
      } catch (error) {
        logWarning?.('Task realtime broadcast failed', {
          channelName,
          error,
          event,
        });
      } finally {
        await sbAdmin.removeChannel(channel).catch((error) => {
          logWarning?.('Task realtime channel cleanup failed', {
            channelName,
            error,
          });
        });
      }
    })
  );
}

export async function loadTaskRealtimeFanoutContext({
  actorUserId,
  sbAdmin,
  taskIds,
}: {
  actorUserId?: string | null;
  sbAdmin: TypedSupabaseClient;
  taskIds: string[];
}): Promise<TaskRealtimeFanoutContext> {
  const uniqueTaskIds = normalizeStringIds(taskIds);
  const sourcesByTaskId = new Map<string, TaskSourceContext>();
  const placementsByTaskId = new Map<string, PersonalTaskPlacement[]>();
  const boardIds = new Set<string>();
  const userIds = new Set<string>();

  if (actorUserId) {
    userIds.add(actorUserId);
  }

  if (uniqueTaskIds.length === 0) {
    return {
      sourcesByTaskId,
      placementsByTaskId,
      boardIds: [],
      userIds: [...userIds],
    };
  }

  const [{ data: taskRows }, { data: placementRows }] = await Promise.all([
    sbAdmin
      .from('tasks')
      .select(
        `
        id,
        list_id,
        task_lists!inner(
          board_id,
          workspace_boards!inner(
            id,
            name,
            ws_id,
            ticket_prefix
          )
        )
        `
      )
      .in('id', uniqueTaskIds),
    sbAdmin
      .from('task_user_overrides')
      .select('task_id, user_id, personal_board_id, personal_list_id')
      .in('task_id', uniqueTaskIds),
  ]);

  for (const task of (taskRows as TaskSourceRow[] | null) ?? []) {
    const sourceBoard = task.task_lists?.workspace_boards ?? null;
    const sourceBoardId = task.task_lists?.board_id ?? sourceBoard?.id ?? null;
    if (sourceBoardId) {
      boardIds.add(sourceBoardId);
    }

    sourcesByTaskId.set(task.id, {
      taskId: task.id,
      sourceBoardId,
      sourceBoardName: sourceBoard?.name ?? null,
      sourceListId: task.list_id,
      sourceWorkspaceId: sourceBoard?.ws_id ?? null,
      ticketPrefix: sourceBoard?.ticket_prefix ?? null,
    });
  }

  for (const placement of (placementRows as TaskPlacementRow[] | null) ?? []) {
    if (!placement.task_id) continue;

    const normalizedPlacement = {
      task_id: placement.task_id,
      user_id: placement.user_id ?? '',
      personal_board_id: placement.personal_board_id,
      personal_list_id: placement.personal_list_id,
    };
    const existing = placementsByTaskId.get(placement.task_id) ?? [];
    existing.push(normalizedPlacement);
    placementsByTaskId.set(placement.task_id, existing);

    if (placement.personal_board_id) {
      boardIds.add(placement.personal_board_id);
    }
    if (placement.user_id) {
      userIds.add(placement.user_id);
    }
  }

  return {
    sourcesByTaskId,
    placementsByTaskId,
    boardIds: [...boardIds],
    userIds: [...userIds],
  };
}

function buildTaskRealtimePayload({
  actorUserId,
  basePayload,
  event,
  source,
  taskId,
  taskPayload,
  placements,
}: {
  actorUserId?: string | null;
  basePayload?: Record<string, unknown>;
  event: TaskRealtimeEvent;
  source?: TaskSourceContext;
  taskId: string;
  taskPayload?: Record<string, unknown>;
  placements: PersonalTaskPlacement[];
}) {
  const sourceBoardId = source?.sourceBoardId ?? null;
  const sourceListId = source?.sourceListId ?? null;
  const enrichedTask =
    taskPayload || event === 'task:upsert'
      ? {
          id: taskId,
          source_board_id: sourceBoardId,
          source_board_name: source?.sourceBoardName ?? null,
          source_list_id: sourceListId,
          source_workspace_id: source?.sourceWorkspaceId ?? null,
          ticket_prefix: source?.ticketPrefix ?? null,
          list_id:
            (taskPayload?.list_id as string | null | undefined) ?? sourceListId,
          ...(taskPayload ?? {}),
        }
      : undefined;

  return {
    ...basePayload,
    __tuturuuuBoardRealtimeEventId: createTaskRealtimeEventId(),
    __tuturuuuBoardRealtimeOrigin: 'server',
    actor_user_id: actorUserId ?? null,
    actorUserId: actorUserId ?? null,
    taskId,
    boardId: sourceBoardId,
    listId: sourceListId,
    source_board_id: sourceBoardId,
    source_board_name: source?.sourceBoardName ?? null,
    source_list_id: sourceListId,
    source_workspace_id: source?.sourceWorkspaceId ?? null,
    personal_placements: placements,
    personal_board_ids: placements
      .map((placement) => placement.personal_board_id)
      .filter(Boolean),
    personal_list_ids: placements
      .map((placement) => placement.personal_list_id)
      .filter(Boolean),
    ...(enrichedTask ? { task: enrichedTask } : {}),
  };
}

export async function publishTaskRealtime({
  actorUserId,
  event,
  logWarning,
  payload,
  sbAdmin,
  taskIds,
  taskPayloadsById,
}: PublishTaskRealtimeOptions) {
  const uniqueTaskIds = normalizeStringIds(taskIds);
  if (uniqueTaskIds.length === 0) return;

  try {
    const fanout = await loadTaskRealtimeFanoutContext({
      actorUserId,
      sbAdmin,
      taskIds: uniqueTaskIds,
    });

    const channelNames = normalizeStringIds([
      ...fanout.boardIds.map(boardRealtimeChannelName),
      ...fanout.userIds.map(taskUserRealtimeChannelName),
    ]);

    if (channelNames.length === 0) return;

    const payloads = uniqueTaskIds.map((taskId) =>
      buildTaskRealtimePayload({
        actorUserId,
        basePayload: payload,
        event,
        placements: fanout.placementsByTaskId.get(taskId) ?? [],
        source: fanout.sourcesByTaskId.get(taskId),
        taskId,
        taskPayload: taskPayloadsById?.get(taskId),
      })
    );

    if (payloads.length === 1) {
      await sendTaskBroadcast({
        sbAdmin,
        channelNames,
        event,
        payload: payloads[0]!,
        logWarning,
      });
      return;
    }

    await sendTaskBroadcast({
      sbAdmin,
      channelNames,
      event: `${event}:batch`,
      payload: {
        __tuturuuuBoardRealtimeEventId: createTaskRealtimeEventId(),
        __tuturuuuBoardRealtimeOrigin: 'server',
        actor_user_id: actorUserId ?? null,
        actorUserId: actorUserId ?? null,
        payloads,
        taskIds: uniqueTaskIds,
      },
      logWarning,
    });
  } catch (error) {
    logWarning?.('Task realtime fanout failed', {
      error,
      event,
      taskIds: uniqueTaskIds,
    });
  }
}

export async function publishBoardListRealtime({
  actorUserId,
  boardId,
  event,
  list,
  listId,
  logWarning,
  payload,
  sbAdmin,
}: PublishBoardListRealtimeOptions) {
  try {
    const normalizedBoardIds = normalizeStringIds([boardId]);
    if (normalizedBoardIds.length === 0) return;

    const channelNames = normalizeStringIds([
      ...normalizedBoardIds.map(boardRealtimeChannelName),
      ...(actorUserId ? [taskUserRealtimeChannelName(actorUserId)] : []),
    ]);

    if (channelNames.length === 0) return;

    await sendTaskBroadcast({
      sbAdmin,
      channelNames,
      event,
      payload: {
        ...payload,
        __tuturuuuBoardRealtimeEventId: createTaskRealtimeEventId(),
        __tuturuuuBoardRealtimeOrigin: 'server',
        actor_user_id: actorUserId ?? null,
        actorUserId: actorUserId ?? null,
        boardId,
        listId: listId ?? (list?.id as string | null | undefined) ?? null,
        ...(list ? { list } : {}),
      },
      logWarning,
    });
  } catch (error) {
    logWarning?.('Task list realtime broadcast failed', {
      boardId,
      error,
      event,
      listId,
    });
  }
}
