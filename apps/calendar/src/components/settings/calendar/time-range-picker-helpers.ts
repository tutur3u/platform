import {
  DAY_KEYS,
  DEFAULT_TIME_BLOCK,
  defaultWeekTimeRanges,
  type TimeBlock,
  type WeekTimeRanges,
} from './hour-settings-shared';

export { DAY_KEYS } from './hour-settings-shared';

function safeTimeBlock(block: unknown): TimeBlock {
  if (!block || typeof block !== 'object') return { ...DEFAULT_TIME_BLOCK };
  const candidate = block as Partial<TimeBlock>;
  return {
    startTime: isValidTimeString(candidate.startTime)
      ? candidate.startTime
      : DEFAULT_TIME_BLOCK.startTime,
    endTime: isValidTimeString(candidate.endTime)
      ? candidate.endTime
      : DEFAULT_TIME_BLOCK.endTime,
  };
}

function isValidTimeString(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function createSafeTimeRanges(
  value?: WeekTimeRanges | null
): WeekTimeRanges {
  const timeRanges = value || defaultWeekTimeRanges;

  return Object.fromEntries(
    DAY_KEYS.map((day) => {
      const range = timeRanges[day];
      return [
        day,
        {
          enabled:
            range && typeof range.enabled === 'boolean' ? range.enabled : false,
          timeBlocks: Array.isArray(range?.timeBlocks)
            ? range.timeBlocks.map(safeTimeBlock)
            : [{ ...DEFAULT_TIME_BLOCK }],
        },
      ];
    })
  ) as WeekTimeRanges;
}

export function normalizeTimeString(time: string): string {
  if (!isValidTimeString(time)) return '00:00';
  const [hours, minutes] = time.split(':').map(Number);
  if (
    hours === undefined ||
    Number.isNaN(hours) ||
    minutes === undefined ||
    Number.isNaN(minutes)
  ) {
    return '00:00';
  }
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}`;
}

export function timeToMinutes(time: string): number {
  if (!isValidTimeString(time)) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  if (
    hours === undefined ||
    Number.isNaN(hours) ||
    minutes === undefined ||
    Number.isNaN(minutes)
  ) {
    return 0;
  }
  return hours * 60 + minutes;
}

export function minutesToTime(minutesSinceMidnight: number): string {
  const hours = Math.floor(minutesSinceMidnight / 60);
  const minutes = minutesSinceMidnight % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}`;
}
