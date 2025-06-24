/**
 * Utility functions for task management and calculations
 */

interface Task {
  id: string;
  name: string;
  description?: string;
  priority?: number | null;
  created_at?: string;
  updated_at?: string;
  end_date?: string | null;
  boardId: string;
  boardName: string;
  listName: string;
  listStatus?: string;
  archived?: boolean;
  completed_at?: string;
  closed_at?: string;
  finished_at?: string;
  done_at?: string;
  [key: string]: any;
}

interface BoardMetrics {
  id: string;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  highPriorityTasks: number;
  progressPercentage: number;
}

/**
 * Calculate the number of days a task is overdue
 * @param dueDate The task's due date
 * @returns Number of days the task is overdue
 */
export function calculateOverdueDays(dueDate: string | Date): number {
  const due = new Date(dueDate);
  return Math.ceil((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Safe utility to get completion date from various possible fields
 * @param task Task object with potential completion date fields
 * @returns Date object or null if no valid completion date found
 */
export function getTaskCompletionDate(task: Task): Date | null {
  const possibleFields = [
    'updated_at',
    'completed_at',
    'closed_at',
    'finished_at',
    'done_at',
  ];

  // First try to get explicit completion dates
  for (const field of possibleFields) {
    const dateStr = task[field];
    if (dateStr) {
      const date = new Date(dateStr);
      if (!Number.isNaN(date.getTime()) && date.getTime() > 0) {
        return date;
      }
    }
  }

  // Fallback: if task is completed but no completion date, use updated_at or created_at as estimate
  if (
    task.listStatus === 'done' ||
    task.listStatus === 'closed' ||
    task.archived
  ) {
    // Try updated_at first (might indicate when status was changed)
    if (task.updated_at) {
      const date = new Date(task.updated_at);
      if (!Number.isNaN(date.getTime()) && date.getTime() > 0) {
        return date;
      }
    }

    // Last resort: use creation date (not ideal but better than nothing)
    if (task.created_at) {
      const date = new Date(task.created_at);
      if (!Number.isNaN(date.getTime()) && date.getTime() > 0) {
        return date;
      }
    }
  }

  return null;
}

/**
 * Get status color for task visualization
 * @param status Task status string
 * @returns CSS class name for background color
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'done':
    case 'closed':
      return 'bg-green-500';
    case 'active':
      return 'bg-blue-500';
    default:
      return 'bg-gray-400';
  }
}

/**
 * Filter tasks based on board selection and status
 * @param tasks Array of tasks to filter
 * @param boardId Board ID to filter by (null for all boards)
 * @param statusFilter Status filter to apply
 * @returns Filtered array of tasks
 */
export function filterTasks(
  tasks: Task[],
  boardId: string | null,
  statusFilter: 'all' | 'not_started' | 'active' | 'done' | 'closed'
): Task[] {
  let filtered = tasks;

  // Filter by board
  if (boardId) {
    filtered = filtered.filter((task) => task.boardId === boardId);
  }

  // Filter by status
  if (statusFilter !== 'all') {
    filtered = filtered.filter((task) => {
      const taskStatus = task.listStatus || 'not_started';
      return taskStatus === statusFilter;
    });
  }

  return filtered;
}

/**
 * Group tasks by their status
 * @param tasks Array of tasks to group
 * @returns Object with tasks grouped by status
 */
export function groupTasksByStatus(tasks: Task[]): Record<string, Task[]> {
  const groups: Record<string, Task[]> = {
    not_started: [],
    active: [],
    done: [],
    closed: [],
  };

  tasks.forEach((task) => {
    if (task.archived || task.listStatus === 'done') {
      groups.done?.push(task);
    } else if (task.listStatus === 'closed') {
      groups.closed?.push(task);
    } else if (task.listStatus === 'active') {
      groups.active?.push(task);
    } else {
      groups.not_started?.push(task);
    }
  });

  return groups;
}

/**
 * Calculate filtered metrics for boards based on selection
 * @param data Array of board data
 * @param selectedBoard Board ID to filter by (null for all boards)
 * @returns Aggregated metrics
 */
export function getFilteredMetrics(
  data: BoardMetrics[],
  selectedBoard: string | null
) {
  const filteredData = selectedBoard
    ? data.filter((board) => board.id === selectedBoard)
    : data;

  const totalTasks = filteredData.reduce(
    (sum, board) => sum + board.totalTasks,
    0
  );
  const totalCompleted = filteredData.reduce(
    (sum, board) => sum + board.completedTasks,
    0
  );
  const totalOverdue = filteredData.reduce(
    (sum, board) => sum + board.overdueTasks,
    0
  );
  const totalHighPriority = filteredData.reduce(
    (sum, board) => sum + board.highPriorityTasks,
    0
  );
  const avgProgress =
    filteredData.length > 0
      ? Math.round(
          filteredData.reduce(
            (sum, board) => sum + board.progressPercentage,
            0
          ) / filteredData.length
        )
      : 0;

  return {
    totalTasks,
    totalCompleted,
    totalOverdue,
    totalHighPriority,
    avgProgress,
  };
}
