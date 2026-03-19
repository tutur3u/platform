export interface SchedulePreviewSummary {
  totalEvents: number;
  habitsScheduled: number;
  tasksScheduled: number;
  partiallyScheduledTasks: number;
  unscheduledTasks: number;
}

export function shouldBlockSafeApply(args: {
  warnings: string[];
  summary: SchedulePreviewSummary;
}) {
  const hasSchedulingRisk =
    args.summary.unscheduledTasks > 0 ||
    args.summary.partiallyScheduledTasks > 0;

  if (!hasSchedulingRisk && args.warnings.length === 0) {
    return null;
  }

  const reasons: string[] = [];

  if (args.summary.unscheduledTasks > 0) {
    reasons.push('unscheduled_tasks');
  }
  if (args.summary.partiallyScheduledTasks > 0) {
    reasons.push('partially_scheduled_tasks');
  }
  if (args.warnings.length > 0) {
    reasons.push('warnings_present');
  }

  return {
    reason: reasons.join(','),
    warningCount: args.warnings.length,
  };
}
