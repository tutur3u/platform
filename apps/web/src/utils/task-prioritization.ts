export interface Task {
  id: string;
  name: string;
  completed: boolean;
  description?: string;
  priority?: number | null;
  assignees?: any[];
  category?: any;
  is_assigned_to_current_user?: boolean;
  board_id?: string;
  board_name?: string;
  list_name?: string;
}

export interface PrioritizedTasksResult {
  nextTask: Task | null;
  availableTasks: Task[];
}

/**
 * Prioritizes tasks based on urgency and assignment
 * 1. Urgent tasks assigned to current user
 * 2. Urgent unassigned tasks
 * 3. Other tasks assigned to current user
 */
export function prioritizeTasks(tasks: Task[]): PrioritizedTasksResult {
  // 1. Urgent tasks assigned to current user
  const myUrgentTasks = tasks.filter((task: Task) => {
    const isUrgent = task.priority === 1;
    const isNotCompleted = !task.completed;
    const isAssignedToMe = task.is_assigned_to_current_user;
    return isUrgent && isNotCompleted && isAssignedToMe;
  });

  // 2. Urgent unassigned tasks
  const urgentUnassigned = tasks.filter((task: Task) => {
    const isUrgent = task.priority === 1;
    const isNotCompleted = !task.completed;
    const isUnassigned = !task.assignees || task.assignees.length === 0;
    return isUrgent && isNotCompleted && isUnassigned;
  });

  // 3. Other tasks assigned to current user
  const myOtherTasks = tasks.filter((task: Task) => {
    const isNotUrgent = !task.priority || task.priority > 1;
    const isNotCompleted = !task.completed;
    const isAssignedToMe = task.is_assigned_to_current_user;
    return isNotUrgent && isNotCompleted && isAssignedToMe;
  });

  // Combine and sort by priority
  const prioritizedTasks = [
    ...myUrgentTasks.sort(
      (a: Task, b: Task) => (a.priority || 99) - (b.priority || 99)
    ),
    ...urgentUnassigned.sort(
      (a: Task, b: Task) => (a.priority || 99) - (b.priority || 99)
    ),
    ...myOtherTasks.sort(
      (a: Task, b: Task) => (a.priority || 99) - (b.priority || 99)
    ),
  ];

  return {
    nextTask: prioritizedTasks[0] || null,
    availableTasks: prioritizedTasks,
  };
}
