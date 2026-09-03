import {
  defaultWeekTimeRanges,
  type TimeBlock,
  type WeekTimeRanges,
} from './hour-settings-shared';

export const DAY_KEYS: Array<keyof WeekTimeRanges> = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const defaultTimeBlock: TimeBlock = {
  startTime: '07:00',
  endTime: '23:00',
};

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
            ? range.timeBlocks.map((block) => ({ ...block }))
            : [{ ...defaultTimeBlock }],
        },
      ];
    })
  ) as WeekTimeRanges;
}

export function normalizeTimeString(time: string): string {
  if (typeof time !== 'string') return '00:00';
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
