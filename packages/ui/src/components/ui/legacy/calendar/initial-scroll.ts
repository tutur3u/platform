import type { WeekTimeRanges } from './settings/time-range-picker';

/** Hour the grid opens at when no working hours are configured. */
export const DEFAULT_WORK_START_HOUR = 8;

function hourOf(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours)) return null;
  return hours! + (Number.isFinite(minutes) ? minutes! / 60 : 0);
}

/** Earliest enabled working-hours start across the week, in decimal hours. */
export function earliestWorkStartHour(workHours?: WeekTimeRanges | null) {
  let earliest: number | null = null;
  for (const day of Object.values(workHours ?? {})) {
    if (!day?.enabled) continue;
    for (const block of day.timeBlocks ?? []) {
      const start = hourOf(block.startTime);
      if (start !== null && (earliest === null || start < earliest)) {
        earliest = start;
      }
    }
  }
  return earliest ?? DEFAULT_WORK_START_HOUR;
}

/**
 * Opening scroll offset for the time grid: the start of the working day,
 * moved so the current time stays in view when today is visible.
 */
export function initialCalendarScrollTop({
  hourHeight,
  nowHour,
  viewportHeight,
  workStartHour,
}: {
  hourHeight: number;
  /** Decimal hour of "now" when today is a visible column, else null. */
  nowHour: number | null;
  viewportHeight: number;
  workStartHour: number;
}) {
  const maxTop = Math.max(0, 24 * hourHeight - viewportHeight);
  const clamp = (value: number) => Math.min(maxTop, Math.max(0, value));
  const workTop = clamp((workStartHour - 0.5) * hourHeight);
  if (nowHour === null) return workTop;
  const nowY = nowHour * hourHeight;
  const comfortablyVisible =
    nowY >= workTop + hourHeight / 2 && nowY <= workTop + viewportHeight * 0.75;
  return comfortablyVisible ? workTop : clamp(nowY - viewportHeight / 3);
}
