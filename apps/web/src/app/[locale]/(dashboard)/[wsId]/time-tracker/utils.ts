import { useMemo } from 'react';
import type {
  ExtendedWorkspaceTask,
  TaskFilters,
  TaskSidebarFilters,
} from './types';

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
  const aPriority = Number(a.priority) || 0;
  const bPriority = Number(b.priority) || 0;
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
 * Base filters interface for common filter properties
 */
interface BaseFilters {
  board: string | null | undefined;
  list: string | null | undefined;
  assignee: string | null | undefined;
}

/**
 * Apply common filters that are shared between timer and sidebar filtering
 */
function applyCommonFilters(
  task: ExtendedWorkspaceTask,
  searchQuery: string,
  filters: BaseFilters
): boolean {
  // Search filter
  const matchesSearch =
    !searchQuery ||
    task.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    task.description?.toLowerCase().includes(searchQuery.toLowerCase());

  if (!matchesSearch) return false;

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
    return task.is_assigned_to_current_user === true;
  } else if (filters.assignee === 'unassigned') {
    return !task.assignees || task.assignees.length === 0;
  } else if (filters.assignee && filters.assignee !== 'all') {
    return (
      task.assignees?.some((assignee) => assignee.id === filters.assignee) ??
      false
    );
  }

  return true;
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
    if (!applyCommonFilters(task, searchQuery, filters)) return false;

    const matchesPriority =
      !filters.priority ||
      filters.priority === 'all' ||
      String(task.priority) === filters.priority;

    const matchesStatus =
      !filters.status ||
      filters.status === 'all' ||
      (task.completed ? 'completed' : 'active') === filters.status;

    return matchesPriority && matchesStatus;
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
    return applyCommonFilters(task, searchQuery, filters);
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
  const name = assignee.display_name?.trim();
  const email = assignee.email?.trim();

  if (name && name.length > 0) {
    // Handle names with multiple parts (e.g., "John Doe" -> "JD")
    const parts = name.split(/\s+/).filter(Boolean);
    if (
      parts.length >= 2 &&
      parts[0] &&
      parts[1] &&
      parts[0].length > 0 &&
      parts[1].length > 0
    ) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    // Safe access to first character
    const firstChar = name.charAt(0);
    if (firstChar) {
      return firstChar.toUpperCase();
    }
  }

  if (email && email.length > 0) {
    // Use part before @ for email
    const username = email.split('@')[0];
    if (username && username.length > 0) {
      const firstChar = username.charAt(0);
      if (firstChar) {
        return firstChar.toUpperCase();
      }
    }
  }

  return '?';
}
