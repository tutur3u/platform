import type {
  ExtendedWorkspaceTask,
  TaskFilters,
  TaskSidebarFilters,
} from './types';
import { useMemo } from 'react';

/**
 * Shared task sorting logic - prioritizes user's assigned tasks, then by priority, then by creation date
 */
export function sortTasks(
  a: ExtendedWorkspaceTask,
  b: ExtendedWorkspaceTask
): number {
  // Prioritize user's assigned tasks
  if (a.is_assigned_to_current_user && !b.is_assigned_to_current_user) {
    return -1;
  }
  if (!a.is_assigned_to_current_user && b.is_assigned_to_current_user) {
    return 1;
  }

  // Then sort by priority (higher priority first)
  const aPriority = a.priority || 0;
  const bPriority = b.priority || 0;
  if (aPriority !== bPriority) {
    return bPriority - aPriority;
  }

  // Finally sort by creation date (newest first)
  return (
    new Date(b.created_at || 0).getTime() -
    new Date(a.created_at || 0).getTime()
  );
}

/**
 * Filter tasks based on search query and filters for timer controls
 */
export function filterTasksForTimer(
  tasks: ExtendedWorkspaceTask[],
  searchQuery: string,
  filters: TaskFilters
): ExtendedWorkspaceTask[] {
  return tasks.filter((task) => {
    const matchesSearch =
      task.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesPriority =
      filters.priority === 'all' || String(task.priority) === filters.priority;

    const matchesStatus =
      filters.status === 'all' ||
      (task.completed ? 'completed' : 'active') === filters.status;

    const matchesBoard =
      filters.board === 'all' || task.board_name === filters.board;

    const matchesList =
      filters.list === 'all' || task.list_name === filters.list;

    const matchesAssignee =
      filters.assignee === 'all' ||
      (filters.assignee === 'mine' && task.is_assigned_to_current_user) ||
      (filters.assignee === 'unassigned' &&
        (!task.assignees || task.assignees.length === 0));

    return (
      matchesSearch &&
      matchesPriority &&
      matchesStatus &&
      matchesBoard &&
      matchesList &&
      matchesAssignee
    );
  });
}

/**
 * Filter tasks for sidebar with different filter structure
 */
export function filterTasksForSidebar(
  tasks: ExtendedWorkspaceTask[],
  searchQuery: string,
  filters: TaskSidebarFilters
): ExtendedWorkspaceTask[] {
  return tasks.filter((task) => {
    // Search filter
    if (
      searchQuery &&
      !task.name?.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !task.description?.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }

    // Board filter
    if (
      filters.board &&
      filters.board !== 'all' &&
      task.board_name !== filters.board
    ) {
      return false;
    }

    // List filter
    if (
      filters.list &&
      filters.list !== 'all' &&
      task.list_name !== filters.list
    ) {
      return false;
    }

    // Assignee filter
    if (filters.assignee === 'mine') {
      return task.is_assigned_to_current_user;
    } else if (filters.assignee === 'unassigned') {
      return !task.assignees || task.assignees.length === 0;
    } else if (filters.assignee && filters.assignee !== 'all') {
      return task.assignees?.some(
        (assignee) => assignee.id === filters.assignee
      );
    }

    return true;
  });
}

/**
 * Get filtered and sorted tasks
 */
export function getFilteredAndSortedTasks(
  tasks: ExtendedWorkspaceTask[],
  searchQuery: string,
  filters: TaskFilters
): ExtendedWorkspaceTask[] {
  return filterTasksForTimer(tasks, searchQuery, filters).sort(sortTasks);
}

/**
 * Get filtered and sorted tasks for sidebar
 */
export function getFilteredAndSortedSidebarTasks(
  tasks: ExtendedWorkspaceTask[],
  searchQuery: string,
  filters: TaskSidebarFilters
): ExtendedWorkspaceTask[] {
  return filterTasksForSidebar(tasks, searchQuery, filters).sort(sortTasks);
}

/**
 * Hook to calculate task counts with memoization
 */
export function useTaskCounts(tasks: ExtendedWorkspaceTask[]) {
  return useMemo(() => {
    const myTasksCount = tasks.filter(
      (task) => task.is_assigned_to_current_user
    ).length;

    const unassignedCount = tasks.filter(
      (task) => !task.assignees || task.assignees.length === 0
    ).length;

    return {
      myTasksCount,
      unassignedCount,
    };
  }, [tasks]);
}

/**
 * Generate initials from assignee name or email consistently
 */
export function generateAssigneeInitials(assignee: {
  display_name?: string;
  email?: string;
}): string {
  return (
    assignee.display_name?.[0] ||
    assignee.email?.[0] ||
    '?'
  ).toUpperCase();
}
