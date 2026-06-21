'use client';

import type { Workspace, WorkspaceTaskBoard } from '@tuturuuu/types';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  TUTURUUU_LOCAL_LOGO_URL,
  TuturuuLogo,
} from '@tuturuuu/ui/custom/tuturuuu-logo';
import { TaskDialogProvider } from '@tuturuuu/ui/tu-do/providers/task-dialog-provider';
import { BoardViews } from '@tuturuuu/ui/tu-do/shared/board-views';
import { ProgressiveLoaderProvider } from '@tuturuuu/ui/tu-do/shared/progressive-loader-context';
import { useMemo } from 'react';
import type { PublicTaskBoardPayload } from '@/lib/tasks/public-task-board';

const PUBLIC_WORKSPACE_ID = 'public-task-board';

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

export default function PublicTaskBoardContent({
  payload,
}: {
  payload: PublicTaskBoardPayload;
}) {
  const generatedAt = payload.generatedAt;
  const workspace = useMemo(
    () =>
      ({
        id: PUBLIC_WORKSPACE_ID,
        name: 'Tuturuuu',
        personal: false,
      }) as Workspace,
    []
  );
  const board = useMemo(
    () =>
      ({
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
      }) as WorkspaceTaskBoard,
    [generatedAt, payload.board, payload.lists]
  );
  const lists = useMemo(
    () =>
      payload.lists.map((list) =>
        toTaskList(list, payload.board.id, generatedAt)
      ),
    [generatedAt, payload.board.id, payload.lists]
  );
  const tasks = useMemo(
    () =>
      payload.tasks.map((task) =>
        toTask(task, payload.board.ticket_prefix, generatedAt)
      ),
    [generatedAt, payload.board.ticket_prefix, payload.tasks]
  );
  const workspaceLabels = useMemo(() => {
    const byId = new Map<
      string,
      {
        id: string;
        name: string;
        color: string;
        created_at: string;
        ws_id: string;
      }
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
  }, [tasks]);
  const progressiveLoader = useMemo(() => {
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
  }, [lists, tasks]);

  return (
    <TaskDialogProvider isPersonalWorkspace={false}>
      <ProgressiveLoaderProvider value={progressiveLoader}>
        <BoardViews
          workspace={workspace}
          board={board}
          tasks={tasks}
          lists={lists}
          workspaceLabels={workspaceLabels}
          canManageBoard={false}
          publicView
          readOnly
          availableViews={['kanban', 'list']}
          publicHeaderPrefix={
            <span className="flex shrink-0 items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-background">
                <TuturuuLogo
                  src={TUTURUUU_LOCAL_LOGO_URL}
                  width={24}
                  height={24}
                  className="h-6 w-6"
                />
              </span>
              <span className="font-semibold text-muted-foreground">/</span>
            </span>
          }
        />
      </ProgressiveLoaderProvider>
    </TaskDialogProvider>
  );
}
