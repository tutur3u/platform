export type TimeBlock = {
  startTime: string;
  endTime: string;
};

export type DayTimeRange = {
  enabled: boolean;
  timeBlocks: TimeBlock[];
};

export type WeekTimeRanges = {
  monday: DayTimeRange;
  tuesday: DayTimeRange;
  wednesday: DayTimeRange;
  thursday: DayTimeRange;
  friday: DayTimeRange;
  saturday: DayTimeRange;
  sunday: DayTimeRange;
};

export type HoursSettingsData = {
  personalHours: WeekTimeRanges;
  workHours: WeekTimeRanges;
  meetingHours: WeekTimeRanges;
};

const defaultTimeBlock: TimeBlock = {
  startTime: '07:00',
  endTime: '23:00',
};

const defaultTimeRange: DayTimeRange = {
  enabled: true,
  timeBlocks: [{ ...defaultTimeBlock }],
};

export const defaultWeekTimeRanges: WeekTimeRanges = {
  monday: { ...defaultTimeRange },
  tuesday: { ...defaultTimeRange },
  wednesday: { ...defaultTimeRange },
  thursday: { ...defaultTimeRange },
  friday: { ...defaultTimeRange },
  saturday: { ...defaultTimeRange },
  sunday: { ...defaultTimeRange },
};

export type HourType = 'PERSONAL' | 'WORK' | 'MEETING';

export function isValidWeekTimeRanges(obj: unknown): obj is WeekTimeRanges {
  if (!obj || typeof obj !== 'object') return false;

  const days = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ] as const;

  return days.every((day) => {
    const dayObj = (obj as Record<string, unknown>)[day];

    return (
      dayObj &&
      typeof dayObj === 'object' &&
      'enabled' in dayObj &&
      typeof (dayObj as { enabled: unknown }).enabled === 'boolean' &&
      'timeBlocks' in dayObj &&
      Array.isArray((dayObj as { timeBlocks: unknown }).timeBlocks)
    );
  });
}

export function safeParseHourSettings(data: unknown): unknown {
  if (typeof data !== 'string') {
    return data;
  }

  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

export function createDefaultHoursSettings(): HoursSettingsData {
  return {
    personalHours: structuredClone(defaultWeekTimeRanges),
    workHours: structuredClone(defaultWeekTimeRanges),
    meetingHours: structuredClone(defaultWeekTimeRanges),
  };
}
