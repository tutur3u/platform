import { horseHead, Icon, Rabbit, Turtle, unicornHead } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import React from 'react';
import { PRIORITY_BADGE_COLORS, PRIORITY_LABELS } from './taskConstants';

export const PRIORITY_ICONS: Record<
  NonNullable<Task['priority']>,
  React.ReactElement
> = {
  critical: <Icon iconNode={unicornHead} />,
  high: <Icon iconNode={horseHead} />,
  normal: <Rabbit />,
  low: <Turtle />,
};

export function getPriorityIcon(
  priority: Task['priority'],
  className?: string
): React.ReactNode {
  if (!priority) return null;
  const icon = PRIORITY_ICONS[priority];
  return icon ? React.cloneElement(icon, { className } as any) : null;
}

/**
 * Get priority label for display
 */
export function getPriorityLabel(priority: Task['priority']): string | null {
  if (!priority) return null;
  return PRIORITY_LABELS[priority] || null;
}

/**
 * Get priority badge component
 */
export function getPriorityIndicator(
  priority: Task['priority']
): React.ReactNode {
  if (!priority) return null;

  const icon = getPriorityIcon(priority, 'size-3');

  return (
    <Badge
      variant="secondary"
      className={cn('p-0.75 text-xs', PRIORITY_BADGE_COLORS[priority])}
    >
      {icon}
    </Badge>
  );
}

/**
 * Check if priority is urgent (critical or high)
 */
export function isUrgentPriority(priority: Task['priority']): boolean {
  return priority === 'critical' || priority === 'high';
}

/**
 * Compare priorities for sorting (critical > high > normal > low > none)
 */
export function comparePriorities(
  a: Task['priority'],
  b: Task['priority']
): number {
  const priorityOrder = {
    critical: 4,
    high: 3,
    normal: 2,
    low: 1,
  };

  const aValue = a ? priorityOrder[a] : 0;
  const bValue = b ? priorityOrder[b] : 0;

  return bValue - aValue; // Descending order
}
