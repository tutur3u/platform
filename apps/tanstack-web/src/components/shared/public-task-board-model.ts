import type { PublicTaskBoardPayload } from '@tuturuuu/internal-api';
import type { Workspace, WorkspaceTaskBoard } from '@tuturuuu/types';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';

const PUBLIC_WORKSPACE_ID = 'public-task-board';

export type PublicTaskBoardViewModel = {
  board: WorkspaceTaskBoard;
  lists: TaskList[];
  tasks: Task[];
  workspace: Workspace;
  workspaceLabels: Array<{
    created_at: string;
    color: string;
    id: string;
    name: string;
    ws_id: string;
  }>;
};

function toTaskList(
  list: PublicTaskBoardPayload['lists'][number],
  boardId: string,
  generatedAt: string
): TaskList {
  return {
    id: list.id,
    name: list.name ?? '',
    archived: false,
    deleted: false,
    created_at: list.created_at ?? generatedAt,
    board_id: boardId,
    creator_id: '',
    status: (list.status ?? 'not_started') as TaskBoardStatus,
    color: (list.color ?? 'GRAY') as SupportedColor,
    position: list.position ?? 0,
  };
}

function toTask(
  task: PublicTaskBoardPayload['tasks'][number],
  ticketPrefix: string | null,
  generatedAt: string
): Task {
  return {
    id: task.id,
    name: task.name,
    list_id: task.list_id,
    display_number: task.display_number ?? 0,
    priority: task.priority,
    start_date: task.start_date ?? undefined,
    end_date: task.end_date,
    created_at: task.created_at ?? generatedAt,
    completed_at: task.completed_at ?? undefined,
    closed_at: task.closed_at ?? undefined,
    estimation_points: task.estimation_points,
    sort_key: task.sort_key,
    labels: task.labels.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
      created_at: generatedAt,
    })),
    projects: task.projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status ?? 'active',
    })),
    assignees: task.assignees.map((assignee) => ({
      id: assignee.id,
      display_name: assignee.display_name ?? undefined,
      avatar_url: assignee.avatar_url ?? undefined,
      handle: assignee.handle ?? undefined,
    })),
    ticket_prefix: ticketPrefix,
  } as Task & { ticket_prefix?: string | null };
}

function buildWorkspaceLabels(tasks: Task[]) {
  const byId = new Map<
    string,
    PublicTaskBoardViewModel['workspaceLabels'][number]
  >();

  for (const task of tasks) {
    for (const label of task.labels ?? []) {
      byId.set(label.id, {
        id: label.id,
        name: label.name,
        color: label.color,
        created_at: label.created_at,
        ws_id: PUBLIC_WORKSPACE_ID,
      });
    }
  }

  return [...byId.values()];
}

export function createPublicTaskBoardViewModel(
  payload: PublicTaskBoardPayload
): PublicTaskBoardViewModel {
  const generatedAt = payload.generatedAt;
  const lists = payload.lists.map((list) =>
    toTaskList(list, payload.board.id, generatedAt)
  );
  const tasks = payload.tasks.map((task) =>
    toTask(task, payload.board.ticket_prefix, generatedAt)
  );

  return {
    workspace: {
      id: PUBLIC_WORKSPACE_ID,
      name: 'Tuturuuu',
      personal: false,
    } as Workspace,
    board: {
      id: payload.board.id,
      name: payload.board.name,
      icon: payload.board.icon,
      ws_id: PUBLIC_WORKSPACE_ID,
      created_at: payload.board.created_at ?? generatedAt,
      archived_at: null,
      deleted_at: null,
      ticket_prefix: payload.board.ticket_prefix,
      default_list_id: payload.lists[0]?.id ?? null,
      estimation_type: null,
      extended_estimation: false,
      allow_zero_estimates: true,
      count_unestimated_issues: false,
    } as WorkspaceTaskBoard,
    lists,
    tasks,
    workspaceLabels: buildWorkspaceLabels(tasks),
  };
}

export function createPublicTaskBoardProgressiveLoader(
  lists: TaskList[],
  tasks: Task[]
) {
  const tasksByList = new Map<string, Task[]>();
  for (const task of tasks) {
    const listTasks = tasksByList.get(task.list_id) ?? [];
    listTasks.push(task);
    tasksByList.set(task.list_id, listTasks);
  }

  return {
    pagination: Object.fromEntries(
      lists.map((list) => {
        const listTasks = tasksByList.get(list.id) ?? [];
        return [
          list.id,
          {
            page: 0,
            hasMore: false,
            totalCount: listTasks.length,
            isLoading: false,
            isInitialLoad: false,
          },
        ];
      })
    ),
    loadListPage: async (listId: string) => {
      const listTasks = tasksByList.get(listId) ?? [];
      return {
        tasks: listTasks,
        totalCount: listTasks.length,
        hasMore: false,
      };
    },
    revalidateLoadedLists: async () => {},
  };
}
