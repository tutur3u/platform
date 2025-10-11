/**
 * Constants for Kanban board component
 * Extracted from kanban.tsx for better maintainability
 */

/** Default height (in pixels) used for task cards when height is not yet measured */
export const DEFAULT_TASK_HEIGHT = 96;

/** Distance threshold (in pixels) before drag operation starts */
export const DRAG_ACTIVATION_DISTANCE = 8;

/** Mobile breakpoint width (in pixels) - matches Tailwind's md breakpoint */
export const MOBILE_BREAKPOINT = 768;

/** Fallback sort key value for tasks without explicit sort_key */
export const MAX_SAFE_INTEGER_SORT = Number.MAX_SAFE_INTEGER;

/**
 * Status order mapping for task list sorting
 * Defines the visual order of columns in the kanban board
 */
export const STATUS_ORDER = {
  not_started: 0,
  active: 1,
  done: 2,
  closed: 3,
} as const;

/**
 * Type for valid list status values
 */
export type ListStatus = keyof typeof STATUS_ORDER;

/**
 * Get the sort order number for a given status
 * Returns 999 for unknown statuses (will be sorted to the end)
 */
export function getStatusOrder(status: string | null | undefined): number {
  if (!status) return 999;
  return STATUS_ORDER[status as ListStatus] ?? 999;
}
