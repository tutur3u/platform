import { listWorkspaceTasks } from '@tuturuuu/internal-api';
import type { Task } from '@tuturuuu/types/primitives/Task';

const KANBAN_DEADLINE_TASK_PAGE_SIZE = 200;

interface ListKanbanDeadlineTasksOptions {
  boardId: string;
  workspaceId: string;
}

export async function listKanbanDeadlineTasks({
  boardId,
  workspaceId,
}: ListKanbanDeadlineTasksOptions): Promise<Task[]> {
  const tasks: Task[] = [];
  let offset = 0;

  while (true) {
    const response = await listWorkspaceTasks(workspaceId, {
      boardId,
      closed: 'exclude',
      completed: 'exclude',
      externalSortBy: 'due-asc',
      hasDueDate: true,
      includeCount: true,
      includeRelationshipSummary: false,
      limit: KANBAN_DEADLINE_TASK_PAGE_SIZE,
      listStatuses: ['not_started', 'active'],
      offset,
      sourceScope: 'all_visible',
    });

    tasks.push(...response.tasks);
    offset += response.tasks.length;

    if (response.tasks.length === 0) break;
    if (typeof response.count === 'number' && offset >= response.count) break;
    if (response.tasks.length < KANBAN_DEADLINE_TASK_PAGE_SIZE) break;
  }

  return tasks;
}
