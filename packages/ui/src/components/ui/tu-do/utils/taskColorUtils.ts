import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { LIST_COLOR_CLASSES, PRIORITY_BORDER_COLORS } from './taskConstants';

/**
 * Get color classes for a task list
 */
export function getListColorClasses(color: SupportedColor): string {
  return LIST_COLOR_CLASSES[color] || LIST_COLOR_CLASSES.GRAY;
}

/**
 * Get border color for a task based on priority
 */
export function getPriorityBorderColor(priority: Task['priority']): string {
  if (!priority) return '';
  return PRIORITY_BORDER_COLORS[priority] || '';
}

/**
 * Get card color classes based on task list color or priority
 */
export function getCardColorClasses(
  taskList?: TaskList,
  priority?: Task['priority']
): string {
  if (taskList?.color) {
    return getListColorClasses(taskList.color);
  }
  if (priority) {
    return getPriorityBorderColor(priority);
  }
  return 'border-l-dynamic-gray/30';
}

/**
 * Get initials from name or email for avatar
 */
export function getAssigneeInitials(
  name?: string | null,
  email?: string | null
): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts?.[0]?.slice(0, 2).toUpperCase() || '';
    if (parts.length > 1) {
      return (
        (parts?.[0]?.[0] || '') + (parts?.[parts.length - 1]?.[0] || '')
      ).toUpperCase();
    }
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return '??';
}
