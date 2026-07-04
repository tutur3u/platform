import type { Habit } from '@tuturuuu/types/primitives/Habit';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';

const PRIORITY_SCORE: Record<TaskPriority, number> = {
  low: 1,
  normal: 2,
  high: 3,
  critical: 4,
};

export type EffectiveSchedulingPriority = {
  basePriority: TaskPriority;
  effectivePriority: TaskPriority;
  priorityScore: number;
  deadlineUrgencyScore: number;
};

export function normalizeTaskPriority(
  priority: TaskPriority | null | undefined
): TaskPriority {
  return priority ?? 'normal';
}

export function getHabitEffectivePriority(habit: Pick<Habit, 'priority'>) {
  const basePriority = normalizeTaskPriority(habit.priority);
  return {
    basePriority,
    effectivePriority: basePriority,
    priorityScore: PRIORITY_SCORE[basePriority],
    deadlineUrgencyScore: 0,
  } satisfies EffectiveSchedulingPriority;
}

export function getDeadlineUrgencyScore(
  endDate: string | null | undefined,
  now: Date
): number {
  if (!endDate) return 0;

  const deadline = new Date(endDate);
  if (Number.isNaN(deadline.getTime())) return 0;

  const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / 3_600_000;
  if (hoursUntilDeadline <= 0) return 3;

  return Number((3 * Math.exp(-hoursUntilDeadline / 48)).toFixed(3));
}

export function getTaskEffectivePriority(
  task: {
    priority: TaskPriority | null | undefined;
    end_date: string | null | undefined;
  },
  now: Date
): EffectiveSchedulingPriority {
  const basePriority = normalizeTaskPriority(task.priority);
  const deadlineUrgencyScore = getDeadlineUrgencyScore(task.end_date, now);
  const priorityScore = PRIORITY_SCORE[basePriority] + deadlineUrgencyScore;

  let effectivePriority: TaskPriority;
  if (priorityScore >= 4.5) effectivePriority = 'critical';
  else if (priorityScore >= 3.1) effectivePriority = 'high';
  else if (priorityScore >= 1.6) effectivePriority = 'normal';
  else effectivePriority = 'low';

  return {
    basePriority,
    effectivePriority,
    priorityScore,
    deadlineUrgencyScore,
  };
}

export function compareEffectivePriorityScores(
  a: EffectiveSchedulingPriority,
  b: EffectiveSchedulingPriority
) {
  return b.priorityScore - a.priorityScore;
}

export function canDisplaceHabitForTask(
  task: EffectiveSchedulingPriority,
  habit: EffectiveSchedulingPriority
) {
  if (task.priorityScore <= habit.priorityScore) return false;
  return (
    task.deadlineUrgencyScore >= 1 || task.effectivePriority === 'critical'
  );
}
