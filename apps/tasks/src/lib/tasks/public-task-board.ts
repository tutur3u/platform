import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export const PUBLIC_TASK_BOARD_TASK_LIMIT = 1000;

export interface PublicTaskBoardBoard {
  created_at: string | null;
  icon: string | null;
  id: string;
  name: string | null;
  ticket_prefix: string | null;
}

export interface PublicTaskBoardList {
  color: string | null;
  created_at: string | null;
  id: string;
  name: string | null;
  position: number | null;
  status: string | null;
}

export interface PublicTaskBoardLabel {
  color: string;
  id: string;
  name: string;
}

export interface PublicTaskBoardProject {
  id: string;
  name: string;
  status: string | null;
}

export interface PublicTaskBoardAssignee {
  avatar_url: string | null;
  display_name: string | null;
  handle: string | null;
  id: string;
}

export type PublicTaskBoardPriority = 'critical' | 'high' | 'low' | 'normal';

export interface PublicTaskBoardTask {
  assignees: PublicTaskBoardAssignee[];
  closed_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  display_number: number | null;
  end_date: string | null;
  estimation_points: number | null;
  id: string;
  labels: PublicTaskBoardLabel[];
  list_id: string;
  name: string;
  priority: PublicTaskBoardPriority | null;
  projects: PublicTaskBoardProject[];
  sort_key: number | null;
  start_date: string | null;
}

export interface PublicTaskBoardPayload {
  board: PublicTaskBoardBoard;
  generatedAt: string;
  lists: PublicTaskBoardList[];
  tasks: PublicTaskBoardTask[];
  truncated: boolean;
}

type PublicLinkRow = {
  board_id?: string | null;
};

type BoardRow = PublicTaskBoardBoard & {
  archived_at?: string | null;
  deleted_at?: string | null;
  ws_id?: string | null;
};

type ListRow = PublicTaskBoardList & {
  archived?: boolean | null;
  board_id?: string | null;
  deleted?: boolean | null;
};

type TaskRow = Omit<
  PublicTaskBoardTask,
  'assignees' | 'labels' | 'projects'
> & {
  board_id?: string | null;
  deleted_at?: string | null;
};

type JoinedLabelRow = {
  task_id?: string | null;
  workspace_task_labels?: PublicTaskBoardLabel | PublicTaskBoardLabel[] | null;
};

type JoinedProjectRow = {
  task_id?: string | null;
  task_projects?: PublicTaskBoardProject | PublicTaskBoardProject[] | null;
};

type JoinedAssigneeRow = {
  task_id?: string | null;
  users?: PublicTaskBoardAssignee | PublicTaskBoardAssignee[] | null;
};

function normalizeCode(code: string) {
  return code.trim().toLowerCase();
}

function getJoinedOne<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function byTaskId<T extends { id: string }>(
  rows: Array<{ item: T | null; taskId: string | null }>
) {
  const map = new Map<string, T[]>();

  for (const row of rows) {
    if (!row.taskId || !row.item?.id) continue;

    const items = map.get(row.taskId) ?? [];
    items.push(row.item);
    map.set(row.taskId, items);
  }

  return map;
}

export function buildPublicTaskBoardPayload({
  assignees,
  board,
  generatedAt = new Date().toISOString(),
  labels,
  lists,
  projects,
  tasks,
  truncated,
}: {
  assignees: JoinedAssigneeRow[];
  board: BoardRow;
  generatedAt?: string;
  labels: JoinedLabelRow[];
  lists: ListRow[];
  projects: JoinedProjectRow[];
  tasks: TaskRow[];
  truncated: boolean;
}): PublicTaskBoardPayload {
  const publicLists = lists
    .filter((list) => !list.deleted && !list.archived)
    .sort((a, b) => {
      const positionDelta = (a.position ?? 0) - (b.position ?? 0);
      if (positionDelta !== 0) return positionDelta;
      return (
        new Date(a.created_at ?? 0).getTime() -
        new Date(b.created_at ?? 0).getTime()
      );
    })
    .map(
      (list): PublicTaskBoardList => ({
        id: list.id,
        name: list.name ?? null,
        status: list.status ?? null,
        color: list.color ?? null,
        position: list.position ?? null,
        created_at: list.created_at ?? null,
      })
    );
  const publicListIds = new Set(publicLists.map((list) => list.id));
  const labelsByTask = byTaskId(
    labels.map((row) => ({
      taskId: row.task_id ?? null,
      item: getJoinedOne(row.workspace_task_labels) ?? null,
    }))
  );
  const projectsByTask = byTaskId(
    projects.map((row) => ({
      taskId: row.task_id ?? null,
      item: getJoinedOne(row.task_projects) ?? null,
    }))
  );
  const assigneesByTask = byTaskId(
    assignees.map((row) => ({
      taskId: row.task_id ?? null,
      item: getJoinedOne(row.users) ?? null,
    }))
  );

  const publicTasks = tasks
    .filter((task) => task.list_id && publicListIds.has(task.list_id))
    .map(
      (task): PublicTaskBoardTask => ({
        id: task.id,
        list_id: task.list_id,
        name: task.name,
        display_number: task.display_number ?? null,
        priority: task.priority ?? null,
        start_date: task.start_date ?? null,
        end_date: task.end_date ?? null,
        created_at: task.created_at ?? null,
        completed_at: task.completed_at ?? null,
        closed_at: task.closed_at ?? null,
        estimation_points: task.estimation_points ?? null,
        sort_key: task.sort_key ?? null,
        labels: labelsByTask.get(task.id) ?? [],
        projects: projectsByTask.get(task.id) ?? [],
        assignees: assigneesByTask.get(task.id) ?? [],
      })
    );

  return {
    board: {
      id: board.id,
      name: board.name ?? null,
      icon: board.icon ?? null,
      ticket_prefix: board.ticket_prefix ?? null,
      created_at: board.created_at ?? null,
    },
    generatedAt,
    lists: publicLists,
    tasks: publicTasks,
    truncated,
  };
}

export async function loadPublicTaskBoard(
  code: string,
  db?: TypedSupabaseClient
): Promise<{ data: PublicTaskBoardPayload; status: 200 } | { status: 404 }> {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) return { status: 404 };

  const sbAdmin =
    db ??
    ((await createAdminClient({ noCookie: true })) as TypedSupabaseClient);

  const { data: link, error: linkError } = await (sbAdmin as any)
    .from('task_board_public_links')
    .select('board_id')
    .eq('code', normalizedCode)
    .eq('enabled', true)
    .is('disabled_at', null)
    .maybeSingle();

  if (linkError) {
    throw new Error('PUBLIC_TASK_BOARD_LINK_QUERY_FAILED');
  }

  const boardId = (link as PublicLinkRow | null)?.board_id ?? null;
  if (!boardId) return { status: 404 };

  const { data: board, error: boardError } = await sbAdmin
    .from('workspace_boards')
    .select(
      'id, name, icon, ticket_prefix, created_at, archived_at, deleted_at'
    )
    .eq('id', boardId)
    .maybeSingle();

  if (boardError) {
    throw new Error('PUBLIC_TASK_BOARD_BOARD_QUERY_FAILED');
  }

  const boardRow = board as BoardRow | null;
  if (!boardRow || boardRow.deleted_at || boardRow.archived_at) {
    return { status: 404 };
  }

  const { data: rawLists, error: listError } = await sbAdmin
    .from('task_lists')
    .select('id, name, status, color, position, created_at, archived, deleted')
    .eq('board_id', boardRow.id);

  if (listError) {
    throw new Error('PUBLIC_TASK_BOARD_LIST_QUERY_FAILED');
  }

  const lists = (rawLists ?? []) as ListRow[];
  const activeListIds = lists
    .filter((list) => !list.deleted && !list.archived)
    .map((list) => list.id);

  if (activeListIds.length === 0) {
    return {
      status: 200,
      data: buildPublicTaskBoardPayload({
        assignees: [],
        board: boardRow,
        labels: [],
        lists,
        projects: [],
        tasks: [],
        truncated: false,
      }),
    };
  }

  const { data: rawTasks, error: taskError } = await sbAdmin
    .from('tasks')
    .select(
      'id, list_id, name, display_number, priority, start_date, end_date, created_at, completed_at, closed_at, estimation_points, sort_key'
    )
    .in('list_id', activeListIds)
    .is('deleted_at', null)
    .order('sort_key', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(PUBLIC_TASK_BOARD_TASK_LIMIT + 1);

  if (taskError) {
    throw new Error('PUBLIC_TASK_BOARD_TASK_QUERY_FAILED');
  }

  const fetchedTasks = (rawTasks ?? []) as TaskRow[];
  const truncated = fetchedTasks.length > PUBLIC_TASK_BOARD_TASK_LIMIT;
  const tasks = fetchedTasks.slice(0, PUBLIC_TASK_BOARD_TASK_LIMIT);
  const taskIds = tasks.map((task) => task.id);

  if (taskIds.length === 0) {
    return {
      status: 200,
      data: buildPublicTaskBoardPayload({
        assignees: [],
        board: boardRow,
        labels: [],
        lists,
        projects: [],
        tasks: [],
        truncated,
      }),
    };
  }

  const [labelResult, projectResult, assigneeResult] = await Promise.all([
    sbAdmin
      .from('task_labels')
      .select('task_id, workspace_task_labels(id, name, color)')
      .in('task_id', taskIds),
    sbAdmin
      .from('task_project_tasks')
      .select('task_id, task_projects(id, name, status)')
      .in('task_id', taskIds),
    sbAdmin
      .from('task_assignees')
      .select('task_id, users(id, display_name, handle, avatar_url)')
      .in('task_id', taskIds),
  ]);

  if (labelResult.error || projectResult.error || assigneeResult.error) {
    throw new Error('PUBLIC_TASK_BOARD_RELATION_QUERY_FAILED');
  }

  return {
    status: 200,
    data: buildPublicTaskBoardPayload({
      assignees: (assigneeResult.data ?? []) as JoinedAssigneeRow[],
      board: boardRow,
      labels: (labelResult.data ?? []) as JoinedLabelRow[],
      lists,
      projects: (projectResult.data ?? []) as JoinedProjectRow[],
      tasks,
      truncated,
    }),
  };
}
