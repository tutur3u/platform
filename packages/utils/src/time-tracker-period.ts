import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

export type TimeTrackerViewMode = 'day' | 'week' | 'month';

type TimeTrackerPeriodBounds = {
  startOfPeriod: Date;
  endOfPeriod: Date;
};

type FormatTimeTrackerDateRangeOptions = {
  locale?: string;
  referenceDate?: Date;
};

const resolveViewMode = (viewMode: TimeTrackerViewMode) =>
  viewMode === 'week' ? 'isoWeek' : viewMode;

export const getTimeTrackerPeriodBounds = (
  currentDate: Date,
  viewMode: TimeTrackerViewMode,
  userTimezone: string
): TimeTrackerPeriodBounds => {
  const view = resolveViewMode(viewMode);
  const start = dayjs(currentDate).tz(userTimezone).startOf(view);
  const end = dayjs(currentDate).tz(userTimezone).endOf(view);

  return {
    startOfPeriod: start.toDate(),
    endOfPeriod: end.toDate(),
  };
};

export const formatTimeTrackerDateRange = (
  start: Date,
  end: Date,
  viewMode: TimeTrackerViewMode,
  options: FormatTimeTrackerDateRangeOptions = {}
): string => {
  const { locale, referenceDate } = options;
  const now = referenceDate ?? new Date();

  if (viewMode === 'day') {
    return start.toLocaleDateString(locale, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: start.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }

  if (viewMode === 'month') {
    return start.toLocaleDateString(locale, {
      month: 'long',
      year: 'numeric',
    });
  }

  return `${start.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
  })} - ${end.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: end.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })}`;
};
