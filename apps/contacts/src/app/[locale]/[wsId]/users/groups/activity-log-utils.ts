export const ACTIVITY_RESOURCE_TYPES = [
  'all',
  'group',
  'membership',
  'post',
  'attendance',
  'metric',
  'student_metric_value',
  'monthly_report',
  'feedback',
  'linked_product',
  'tag',
  'course_module',
  'course_module_group',
] as const;

export const ACTIVITY_ACTIONS = [
  'all',
  'created',
  'updated',
  'deleted',
  'archived',
  'reactivated',
  'reordered',
  'role_updated',
] as const;

export function toDateInputValue(value: string) {
  return value.slice(0, 10);
}

export function formatActivityDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
