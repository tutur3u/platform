import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';

/**
 * Get Tailwind CSS classes for priority badge styling.
 * Returns color-specific border, background, and text classes based on priority level.
 *
 * @param priority - Task priority level (critical, high, normal, low) or null
 * @returns Tailwind class string for the badge
 */
export function getPriorityBadgeStyles(priority: TaskPriority | null): string {
  if (!priority) {
    return 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground';
  }

  const colorMap: Record<TaskPriority, string> = {
    critical:
      'border-dynamic-red/30 bg-dynamic-red/15 text-dynamic-red hover:border-dynamic-red/50 hover:bg-dynamic-red/20',
    high: 'border-dynamic-orange/30 bg-dynamic-orange/15 text-dynamic-orange hover:border-dynamic-orange/50 hover:bg-dynamic-orange/20',
    normal:
      'border-dynamic-yellow/30 bg-dynamic-yellow/15 text-dynamic-yellow hover:border-dynamic-yellow/50 hover:bg-dynamic-yellow/20',
    low: 'border-dynamic-blue/30 bg-dynamic-blue/15 text-dynamic-blue hover:border-dynamic-blue/50 hover:bg-dynamic-blue/20',
  };

  return colorMap[priority];
}

/**
 * Get user-friendly label for priority level.
 *
 * @param priority - Task priority level
 * @returns Human-readable priority label
 */
export function getPriorityLabel(priority: TaskPriority): string {
  const labelMap: Record<TaskPriority, string> = {
    critical: 'Urgent',
    high: 'High',
    normal: 'Medium',
    low: 'Low',
  };

  return labelMap[priority];
}
