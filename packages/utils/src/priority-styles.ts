/**
 * Priority styling utilities for task priority badges and labels.
 * Provides consistent styling and user-friendly labels across the application.
 */

/**
 * Get Tailwind CSS classes for priority badge styling.
 * Returns appropriate background and text color classes based on priority level.
 *
 * @param priority - Priority level (0-3: None, Low, Medium, High)
 * @returns Tailwind CSS class string for badge styling
 */
export function getPriorityBadgeStyles(priority: number): string {
  switch (priority) {
    case 1:
      return 'bg-dynamic-blue/10 text-dynamic-blue';
    case 2:
      return 'bg-dynamic-yellow/10 text-dynamic-yellow';
    case 3:
      return 'bg-dynamic-red/10 text-dynamic-red';
    default:
      return 'bg-foreground/10 text-foreground/80';
  }
}

/**
 * Get user-friendly label for priority level.
 * Provides localized (or localizable) labels for each priority.
 *
 * @param priority - Priority level (0-3)
 * @param t - Translation function (optional, for i18n support)
 * @returns User-friendly priority label
 */
export function getPriorityLabel(
  priority: number,
  t?: (key: string) => string
): string {
  const labels = ['None', 'Low', 'Medium', 'High'];
  return t
    ? t(`priority.${labels[priority]?.toLowerCase() || 'none'}`)
    : labels[priority] || 'None';
}
