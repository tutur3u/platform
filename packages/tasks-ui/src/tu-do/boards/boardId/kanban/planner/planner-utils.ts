import type {
  TaskPlan,
  TaskPlanItem,
  TaskPlanPeriod,
  TaskPlanStatus,
} from '@tuturuuu/internal-api';

export const TASK_PLAN_PERIODS: TaskPlanPeriod[] = ['week', 'month', 'year'];
export const TASK_PLAN_STATUSES: TaskPlanStatus[] = [
  'draft',
  'active',
  'sent',
  'archived',
];

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function buildPlanWindow(period: TaskPlanPeriod, anchor = new Date()) {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  if (period === 'week') {
    const day = start.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayOffset);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  } else if (period === 'month') {
    start.setDate(1);
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0);
  } else {
    start.setMonth(0, 1);
    end.setFullYear(start.getFullYear(), 11, 31);
  }

  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  };
}

export function getDefaultPlanTitle(period: TaskPlanPeriod) {
  const window = buildPlanWindow(period);
  return `${period[0]?.toUpperCase()}${period.slice(1)} plan ${window.start}`;
}

export function getPlanWindowLabel(
  plan: Pick<TaskPlan, 'period_start' | 'period_end'>
) {
  return `${plan.period_start} -> ${plan.period_end}`;
}

export function getTaskPlanItemScope(
  item: Pick<TaskPlanItem, 'task_id' | 'target_ws_id' | 'status'>,
  personalWorkspaceId: string
) {
  if (item.status === 'draft' || !item.task_id) return 'draft';
  if (!item.target_ws_id || item.target_ws_id === personalWorkspaceId) {
    return 'personal';
  }
  return 'external';
}
