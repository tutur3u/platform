export function priorityLabelKey(priority: string) {
  switch (priority) {
    case 'critical':
      return 'tasks.priority_critical' as const;
    case 'high':
      return 'tasks.priority_high' as const;
    case 'low':
      return 'tasks.priority_low' as const;
    default:
      return 'tasks.priority_normal' as const;
  }
}
