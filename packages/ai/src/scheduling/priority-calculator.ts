/**
 * Priority Calculator for Unified Scheduling
 *
 * This module provides centralized priority logic for scheduling habits and tasks.
 * It handles:
 * - Explicit priority comparison
 * - Priority inference from deadlines when not set
 * - Consistent priority weights across the system
 */

import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';

/**
 * Priority weights for comparison (higher = more important)
 */
export const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
} as const;

/**
 * Interface for items that can have priority calculated
 */
export interface PrioritizableItem {
  priority?: TaskPriority | null;
  end_date?: string | null; // deadline
}

/**
 * Get the effective priority for an item
 * If priority is explicitly set, use it.
 * Otherwise, infer from deadline proximity:
 * - < 24 hours: urgent (mapped to critical)
 * - < 48 hours: high
 * - Has deadline: normal
 * - No deadline: low
 */
export function getEffectivePriority(item: PrioritizableItem): TaskPriority {
  // If priority is explicitly set, use it
  if (item.priority) {
    return item.priority;
  }

  // No deadline means low priority
  if (!item.end_date) {
    return 'low';
  }

  // Calculate hours until deadline
  const deadline = new Date(item.end_date);
  const now = new Date();
  const hoursUntilDeadline =
    (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Infer priority from deadline proximity
  if (hoursUntilDeadline <= 0) {
    // Overdue - treat as critical
    return 'critical';
  }
  if (hoursUntilDeadline <= 24) {
    return 'critical';
  }
  if (hoursUntilDeadline <= 48) {
    return 'high';
  }

  // Has deadline but not urgent
  return 'normal';
}

/**
 * Compare two priorities for sorting
 * Returns negative if a should come first (higher priority)
 * Returns positive if b should come first (higher priority)
 * Returns 0 if equal
 */
export function comparePriority(a: TaskPriority, b: TaskPriority): number {
  return PRIORITY_WEIGHTS[b] - PRIORITY_WEIGHTS[a];
}

/**
 * Check if priority A is higher than priority B
 */
export function isHigherPriority(a: TaskPriority, b: TaskPriority): boolean {
  return PRIORITY_WEIGHTS[a] > PRIORITY_WEIGHTS[b];
}

/**
 * Check if an item is urgent (critical priority, either explicit or inferred)
 */
export function isUrgent(item: PrioritizableItem): boolean {
  return getEffectivePriority(item) === 'critical';
}

/**
 * Check if an item can bump another based on priority
 * Bumping is only allowed when:
 * - The bumper has higher effective priority than the target
 * - The bumper is urgent (critical priority)
 */
export function canBump(
  bumper: PrioritizableItem,
  target: PrioritizableItem
): boolean {
  const bumperPriority = getEffectivePriority(bumper);
  const targetPriority = getEffectivePriority(target);

  // Only urgent items can bump
  if (bumperPriority !== 'critical') {
    return false;
  }

  // Can bump if target has lower priority
  return isHigherPriority(bumperPriority, targetPriority);
}

/**
 * Sort items by effective priority (highest first)
 * Secondary sort by deadline (earliest first) if priorities are equal
 * Tertiary sort by created_at (oldest first) if available
 */
export function sortByPriority<
  T extends PrioritizableItem & { created_at?: string },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    // Primary: Priority (highest first)
    const priorityDiff = comparePriority(
      getEffectivePriority(a),
      getEffectivePriority(b)
    );
    if (priorityDiff !== 0) return priorityDiff;

    // Secondary: Deadline (earliest first, nulls last)
    if (a.end_date && b.end_date) {
      const deadlineDiff =
        new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
      if (deadlineDiff !== 0) return deadlineDiff;
    } else if (a.end_date) {
      return -1; // a has deadline, b doesn't
    } else if (b.end_date) {
      return 1; // b has deadline, a doesn't
    }

    // Tertiary: Created date (oldest first)
    if (a.created_at && b.created_at) {
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }

    return 0;
  });
}

/**
 * Calculate a numeric priority score for advanced sorting
 * Higher score = higher priority
 */
export function calculatePriorityScore(item: PrioritizableItem): number {
  const priority = getEffectivePriority(item);
  let score = PRIORITY_WEIGHTS[priority] * 1000;

  // Add urgency bonus based on deadline proximity
  if (item.end_date) {
    const deadline = new Date(item.end_date);
    const now = new Date();
    const hoursUntilDeadline =
      (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilDeadline < 0) {
      // Overdue - maximum urgency
      score += 5000;
    } else if (hoursUntilDeadline < 24) {
      score += 2000;
    } else if (hoursUntilDeadline < 48) {
      score += 1000;
    } else if (hoursUntilDeadline < 72) {
      score += 500;
    } else if (hoursUntilDeadline < 168) {
      score += 200;
    }
  }

  return score;
}
