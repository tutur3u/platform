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
 * Get ticket identifier badge color classes based on task list color or priority
 */
export function getTicketBadgeColorClasses(
  taskList?: TaskList,
  priority?: Task['priority']
): string {
  // Color mapping for ticket badges (lighter than card borders)
  const ticketColorClasses: Record<SupportedColor, string> = {
    GRAY: 'border-dynamic-gray/30 bg-dynamic-gray/5 text-foreground',
    RED: 'border-dynamic-red/30 bg-dynamic-red/5 text-dynamic-red',
    BLUE: 'border-dynamic-blue/30 bg-dynamic-blue/5 text-dynamic-blue',
    GREEN: 'border-dynamic-green/30 bg-dynamic-green/5 text-dynamic-green',
    YELLOW: 'border-dynamic-yellow/30 bg-dynamic-yellow/5 text-dynamic-yellow',
    ORANGE: 'border-dynamic-orange/30 bg-dynamic-orange/5 text-dynamic-orange',
    PURPLE: 'border-dynamic-purple/30 bg-dynamic-purple/5 text-dynamic-purple',
    PINK: 'border-dynamic-pink/30 bg-dynamic-pink/5 text-dynamic-pink',
    INDIGO: 'border-dynamic-indigo/30 bg-dynamic-indigo/5 text-dynamic-indigo',
    CYAN: 'border-dynamic-cyan/30 bg-dynamic-cyan/5 text-dynamic-cyan',
  };

  const priorityTicketColors: Record<NonNullable<Task['priority']>, string> = {
    critical: 'border-dynamic-red/30 bg-dynamic-red/5 text-dynamic-red',
    high: 'border-dynamic-orange/30 bg-dynamic-orange/5 text-dynamic-orange',
    normal: 'border-dynamic-yellow/30 bg-dynamic-yellow/5 text-dynamic-yellow',
    low: 'border-dynamic-blue/30 bg-dynamic-blue/5 text-dynamic-blue',
  };

  if (taskList?.color) {
    return ticketColorClasses[taskList.color] || ticketColorClasses.GRAY;
  }
  if (priority) {
    return priorityTicketColors[priority] || '';
  }
  return ticketColorClasses.GRAY;
}

/**
 * Text color classes for each supported color
 */
const LIST_TEXT_COLOR_CLASSES: Record<SupportedColor, string> = {
  GRAY: 'text-dynamic-gray',
  RED: 'text-dynamic-red',
  BLUE: 'text-dynamic-blue',
  GREEN: 'text-dynamic-green',
  YELLOW: 'text-dynamic-yellow',
  ORANGE: 'text-dynamic-orange',
  PURPLE: 'text-dynamic-purple',
  PINK: 'text-dynamic-pink',
  INDIGO: 'text-dynamic-indigo',
  CYAN: 'text-dynamic-cyan',
};

/**
 * Get text color class for a task list (for completion/closed text)
 */
export function getListTextColorClass(color?: SupportedColor | null): string {
  if (!color) return 'text-muted-foreground';
  return LIST_TEXT_COLOR_CLASSES[color] || 'text-muted-foreground';
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
