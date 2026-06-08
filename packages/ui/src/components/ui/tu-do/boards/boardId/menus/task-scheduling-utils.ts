import type { CalendarHoursType } from '@tuturuuu/types/primitives/Task';

export function taskDurationHoursToMinutes(durationHours: number | null) {
  if (!durationHours || durationHours <= 0) return 0;
  return Math.round(durationHours * 60);
}

export function taskDurationMinutesToHours(durationMinutes: number) {
  if (durationMinutes <= 0) return null;
  return Number((durationMinutes / 60).toFixed(2));
}

export function formatTaskDurationLabel(durationHours: number | null) {
  const totalMinutes = taskDurationHoursToMinutes(durationHours);
  if (totalMinutes <= 0) return null;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export interface TaskSchedulingBadgeTitleLabels {
  autoSchedule: string;
  estimatedDuration: string;
  meetingHours: string;
  personalHours: string;
  splittable: string;
  workHours: string;
}

export function getTaskSchedulingHourTypeLabel(
  calendarHours: CalendarHoursType | null | undefined,
  labels: Pick<
    TaskSchedulingBadgeTitleLabels,
    'meetingHours' | 'personalHours' | 'workHours'
  >
) {
  switch (calendarHours) {
    case 'work_hours':
      return labels.workHours;
    case 'meeting_hours':
      return labels.meetingHours;
    case 'personal_hours':
      return labels.personalHours;
    default:
      return null;
  }
}

function formatSplitMinutesRangeLabel(
  minSplitDurationMinutes: number | null | undefined,
  maxSplitDurationMinutes: number | null | undefined
) {
  if (!minSplitDurationMinutes || !maxSplitDurationMinutes) {
    return null;
  }

  const minLabel = formatTaskDurationLabel(minSplitDurationMinutes / 60);
  const maxLabel = formatTaskDurationLabel(maxSplitDurationMinutes / 60);
  if (!minLabel || !maxLabel) return null;

  return `${minLabel}-${maxLabel}`;
}

export function formatTaskSchedulingBadgeTitle({
  autoSchedule,
  calendarHours,
  durationLabel,
  isSplittable,
  labels,
  maxSplitDurationMinutes,
  minSplitDurationMinutes,
}: {
  autoSchedule?: boolean | null;
  calendarHours?: CalendarHoursType | null;
  durationLabel: string;
  isSplittable?: boolean | null;
  labels: TaskSchedulingBadgeTitleLabels;
  maxSplitDurationMinutes?: number | null;
  minSplitDurationMinutes?: number | null;
}) {
  const titleParts = [`${labels.estimatedDuration}: ${durationLabel}`];
  const hourTypeLabel = getTaskSchedulingHourTypeLabel(calendarHours, labels);

  if (hourTypeLabel) {
    titleParts.push(hourTypeLabel);
  }

  if (isSplittable) {
    const splitRangeLabel = formatSplitMinutesRangeLabel(
      minSplitDurationMinutes,
      maxSplitDurationMinutes
    );
    titleParts.push(
      splitRangeLabel
        ? `${labels.splittable}: ${splitRangeLabel}`
        : labels.splittable
    );
  }

  if (autoSchedule) {
    titleParts.push(labels.autoSchedule);
  }

  return titleParts.join(' | ');
}
