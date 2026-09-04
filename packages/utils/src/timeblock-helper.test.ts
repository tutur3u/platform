import { readFileSync } from 'node:fs';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import {
  addTimeblocks,
  datesToDateMatrix,
  datesToTimeMatrix,
  durationToTimeblocks,
  getDateStrings,
  removeTimeblocks,
} from './timeblock-helper';

const originalTimezone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'UTC';
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
});

afterAll(() => {
  vi.useRealTimers();
  process.env.TZ = originalTimezone;
});

function date(value: string) {
  return new Date(value);
}

function block(
  blockDate: string,
  startTime: string,
  endTime: string,
  tentative = false
): Timeblock {
  return {
    date: blockDate,
    end_time: endTime,
    start_time: startTime,
    tentative,
  };
}

function normalize(timeblocks: Timeblock[]) {
  return timeblocks.map(
    ({ date: blockDate, end_time, start_time, tentative }) =>
      block(blockDate, start_time, end_time, tentative)
  );
}

describe('timeblock temporal contract', () => {
  test('uses a fixed UTC clock for deterministic date and time matrices', () => {
    expect(process.env.TZ).toBe('UTC');
    expect(new Date().toISOString()).toBe('2024-01-15T12:00:00.000Z');
  });

  test('formats dates in the fixed runtime timezone', () => {
    expect(
      getDateStrings([
        date('2024-03-15T23:30:00Z'),
        date('2024-03-16T00:30:00Z'),
      ])
    ).toEqual(['2024-03-15', '2024-03-16']);
  });

  test('rejects empty date and time matrices', () => {
    expect(() => datesToDateMatrix([])).toThrow('Invalid input');
    expect(() => datesToTimeMatrix([])).toThrow('Invalid input');
  });

  test('normalizes reverse date endpoints and includes the final grid cell', () => {
    const matrix = datesToDateMatrix([
      date('2024-03-17T19:00:00Z'),
      date('2024-03-15T08:00:00Z'),
    ]);
    expect(matrix.soonest.toISOString()).toBe('2024-03-15T08:00:00.000Z');
    expect(matrix.latest.toISOString()).toBe('2024-03-17T19:15:00.000Z');
  });

  test('normalizes reverse time endpoints independently of their dates', () => {
    const matrix = datesToTimeMatrix([
      date('2024-03-15T19:00:00Z'),
      date('2024-03-17T08:00:00Z'),
    ]);
    expect(matrix.soonest.format('HH:mm:ssZ')).toBe('08:00:00+00:00');
    expect(matrix.latest.format('HH:mm:ssZ')).toBe('19:00:00+00:00');
  });
});

const durationCases: Array<{
  dates: Date[];
  expected: Timeblock[];
  name: string;
  tentative?: boolean;
}> = [
  { dates: [], expected: [], name: 'empty selection' },
  {
    dates: [date('2024-03-15T08:00:00Z')],
    expected: [block('2024-03-15', '08:00:00+00:00', '08:15:00+00:00')],
    name: 'one selected cell',
  },
  {
    dates: [date('2024-03-15T08:00:00Z'), date('2024-03-15T08:00:00Z')],
    expected: [block('2024-03-15', '08:00:00+00:00', '08:15:00+00:00')],
    name: 'equal endpoints',
  },
  {
    dates: [
      date('2024-03-15T08:00:00Z'),
      date('2024-03-15T08:15:00Z'),
      date('2024-03-15T08:30:00Z'),
    ],
    expected: [],
    name: 'more than two endpoints',
  },
  {
    dates: [date('2024-03-15T08:00:00Z'), date('2024-03-15T19:00:00Z')],
    expected: [block('2024-03-15', '08:00:00+00:00', '19:15:00+00:00')],
    name: 'same-day forward selection',
  },
  {
    dates: [date('2024-03-15T19:00:00Z'), date('2024-03-15T08:00:00Z')],
    expected: [block('2024-03-15', '08:00:00+00:00', '19:15:00+00:00')],
    name: 'same-day reverse selection',
  },
  {
    dates: [date('2024-03-15T08:00:00Z'), date('2024-03-17T19:00:00Z')],
    expected: ['15', '16', '17'].map((day) =>
      block(`2024-03-${day}`, '08:00:00+00:00', '19:15:00+00:00')
    ),
    name: 'multi-day forward selection',
  },
  {
    dates: [date('2024-03-17T19:00:00Z'), date('2024-03-15T08:00:00Z')],
    expected: ['15', '16', '17'].map((day) =>
      block(`2024-03-${day}`, '08:00:00+00:00', '19:15:00+00:00')
    ),
    name: 'multi-day reverse selection',
  },
  {
    dates: [
      date('2024-03-15T08:00:00+02:00'),
      date('2024-03-17T19:00:00+02:00'),
    ],
    expected: ['15', '16', '17'].map((day) =>
      block(`2024-03-${day}`, '06:00:00+00:00', '17:15:00+00:00')
    ),
    name: 'positive input offset normalized to UTC',
  },
  {
    dates: [
      date('2024-03-15T08:00:00-02:00'),
      date('2024-03-17T19:00:00-02:00'),
    ],
    expected: ['15', '16', '17'].map((day) =>
      block(`2024-03-${day}`, '10:00:00+00:00', '21:15:00+00:00')
    ),
    name: 'negative input offset normalized to UTC',
  },
  {
    dates: [
      date('2024-03-09T08:00:00-05:00'),
      date('2024-03-11T09:00:00-04:00'),
    ],
    expected: ['09', '10', '11'].map((day) =>
      block(`2024-03-${day}`, '13:00:00+00:00', '13:15:00+00:00', true)
    ),
    name: 'DST-adjacent explicit offsets normalized by instant',
    tentative: true,
  },
];

describe('durationToTimeblocks', () => {
  test.each(durationCases)('$name', ({ dates, expected, tentative }) => {
    expect(normalize(durationToTimeblocks(dates, tentative ?? false))).toEqual(
      expected
    );
  });
});

const addCases: Array<{
  dates: Date[];
  expected: Timeblock[];
  name: string;
  previous: Timeblock[];
  tentative?: boolean;
}> = [
  { dates: [], expected: [], name: 'empty state and selection', previous: [] },
  {
    dates: [],
    expected: [block('2024-03-15', '08:00:00+00:00', '09:00:00+00:00')],
    name: 'empty selection preserves state',
    previous: [block('2024-03-15', '08:00:00+00:00', '09:00:00+00:00')],
  },
  {
    dates: [date('2024-03-16T10:00:00Z'), date('2024-03-16T15:15:00Z')],
    expected: [
      block('2024-03-15', '08:00:00+00:00', '09:00:00+00:00'),
      block('2024-03-16', '10:00:00+00:00', '15:30:00+00:00'),
    ],
    name: 'different day sorted after existing state',
    previous: [block('2024-03-15', '08:00:00+00:00', '09:00:00+00:00')],
  },
  {
    dates: [date('2024-03-15T08:15:00Z'), date('2024-03-15T08:30:00Z')],
    expected: [block('2024-03-15', '08:00:00+00:00', '09:00:00+00:00')],
    name: 'contained overlap',
    previous: [block('2024-03-15', '08:00:00+00:00', '09:00:00+00:00')],
  },
  {
    dates: [date('2024-03-15T09:00:00Z'), date('2024-03-15T09:00:00Z')],
    expected: [block('2024-03-15', '08:00:00+00:00', '09:15:00+00:00')],
    name: 'adjacent selection merges',
    previous: [block('2024-03-15', '08:00:00+00:00', '09:00:00+00:00')],
  },
  {
    dates: [date('2024-03-15T10:00:00Z'), date('2024-03-15T10:00:00Z')],
    expected: [
      block('2024-03-15', '08:00:00+00:00', '09:00:00+00:00'),
      block('2024-03-15', '10:00:00+00:00', '10:15:00+00:00'),
    ],
    name: 'disjoint same-day selection stays separate',
    previous: [block('2024-03-15', '08:00:00+00:00', '09:00:00+00:00')],
  },
  {
    dates: [date('2024-03-15T08:30:00Z'), date('2024-03-15T10:00:00Z')],
    expected: [block('2024-03-15', '08:00:00+00:00', '10:15:00+00:00')],
    name: 'right overlap extends through final cell',
    previous: [block('2024-03-15', '08:00:00+00:00', '09:00:00+00:00')],
  },
  {
    dates: [date('2024-03-15T08:00:00Z'), date('2024-03-15T09:00:00Z')],
    expected: [block('2024-03-15', '08:00:00+00:00', '10:00:00+00:00')],
    name: 'left overlap normalizes reverse coverage',
    previous: [block('2024-03-15', '09:00:00+00:00', '10:00:00+00:00')],
  },
  {
    dates: [date('2024-03-15T08:30:00Z'), date('2024-03-15T09:00:00Z')],
    expected: [
      block('2024-03-15', '08:00:00+00:00', '08:30:00+00:00'),
      block('2024-03-15', '08:30:00+00:00', '09:15:00+00:00', true),
      block('2024-03-15', '09:15:00+00:00', '10:00:00+00:00'),
    ],
    name: 'tentative overlap splits committed state',
    previous: [block('2024-03-15', '08:00:00+00:00', '10:00:00+00:00')],
    tentative: true,
  },
];

describe('addTimeblocks', () => {
  test.each(addCases)('$name', ({ dates, expected, previous, tentative }) => {
    expect(
      normalize(addTimeblocks(previous, dates, tentative ?? false))
    ).toEqual(expected);
  });
});

const baseHour = block('2024-03-15', '08:00:00+00:00', '09:00:00+00:00');

const removalCases: Array<{
  dates: Date[];
  expected: Timeblock[];
  name: string;
  previous: Timeblock[];
}> = [
  { dates: [], expected: [], name: 'empty state and selection', previous: [] },
  {
    dates: [],
    expected: [baseHour],
    name: 'empty selection preserves state',
    previous: [baseHour],
  },
  {
    dates: [date('2024-03-15T08:15:00Z')],
    expected: [
      block('2024-03-15', '08:00:00+00:00', '08:15:00+00:00'),
      block('2024-03-15', '08:30:00+00:00', '09:00:00+00:00'),
    ],
    name: 'one-date shape removes exactly one cell',
    previous: [baseHour],
  },
  {
    dates: [date('2024-03-15T08:15:00Z'), date('2024-03-15T08:15:00Z')],
    expected: [
      block('2024-03-15', '08:00:00+00:00', '08:15:00+00:00'),
      block('2024-03-15', '08:30:00+00:00', '09:00:00+00:00'),
    ],
    name: 'equal endpoints remove exactly one cell',
    previous: [baseHour],
  },
  {
    dates: [
      date('2024-03-15T08:00:00Z'),
      date('2024-03-15T08:30:00Z'),
      date('2024-03-15T08:45:00Z'),
    ],
    expected: [block('2024-03-15', '08:15:00+00:00', '08:30:00+00:00')],
    name: 'per-date shape removes one cell per selected instant',
    previous: [baseHour],
  },
  {
    dates: [date('2024-03-15T08:00:00Z'), date('2024-03-15T12:00:00Z')],
    expected: [block('2024-03-15', '12:15:00+00:00', '19:15:00+00:00')],
    name: 'first range split',
    previous: [block('2024-03-15', '08:00:00+00:00', '19:15:00+00:00')],
  },
  {
    dates: [date('2024-03-15T12:00:00Z'), date('2024-03-15T19:00:00Z')],
    expected: [block('2024-03-15', '08:00:00+00:00', '12:00:00+00:00')],
    name: 'last range split',
    previous: [block('2024-03-15', '08:00:00+00:00', '19:15:00+00:00')],
  },
  {
    dates: [date('2024-03-15T10:00:00Z'), date('2024-03-15T15:15:00Z')],
    expected: [
      block('2024-03-15', '08:00:00+00:00', '10:00:00+00:00'),
      block('2024-03-15', '15:30:00+00:00', '19:15:00+00:00'),
    ],
    name: 'middle range split',
    previous: [block('2024-03-15', '08:00:00+00:00', '19:15:00+00:00')],
  },
  {
    dates: [date('2024-03-15T08:00:00Z'), date('2024-03-15T19:00:00Z')],
    expected: [],
    name: 'full range removal',
    previous: [block('2024-03-15', '08:00:00+00:00', '19:15:00+00:00')],
  },
  {
    dates: [date('2024-03-15T08:00:00Z'), date('2024-03-17T08:45:00Z')],
    expected: [block('2024-03-15', '10:00:00+00:00', '11:00:00+00:00')],
    name: 'same slot across multiple days',
    previous: [
      ...['15', '16', '17'].map((day) =>
        block(`2024-03-${day}`, '08:00:00+00:00', '09:00:00+00:00')
      ),
      block('2024-03-15', '10:00:00+00:00', '11:00:00+00:00'),
    ],
  },
  {
    dates: [date('2024-03-15T08:00:00Z'), date('2024-03-15T19:00:00Z')],
    expected: [block('2024-03-16', '08:00:00+00:00', '19:15:00+00:00')],
    name: 'full removal across adjacent blocks on one day',
    previous: [
      block('2024-03-15', '08:00:00+00:00', '12:00:00+00:00'),
      block('2024-03-15', '12:00:00+00:00', '19:15:00+00:00'),
      block('2024-03-16', '08:00:00+00:00', '19:15:00+00:00'),
    ],
  },
  {
    dates: [date('2024-03-15T08:00:00Z'), date('2024-03-16T19:00:00Z')],
    expected: [],
    name: 'multi-day full removal',
    previous: [
      block('2024-03-15', '08:00:00+00:00', '19:15:00+00:00'),
      block('2024-03-16', '08:00:00+00:00', '19:15:00+00:00'),
    ],
  },
  {
    dates: [date('2024-03-16T19:00:00Z'), date('2024-03-15T08:00:00Z')],
    expected: [],
    name: 'reverse multi-day full removal',
    previous: [
      block('2024-03-15', '08:00:00+00:00', '19:15:00+00:00'),
      block('2024-03-16', '08:00:00+00:00', '19:15:00+00:00'),
    ],
  },
];

describe('removeTimeblocks', () => {
  test.each(removalCases)('$name', ({ dates, expected, previous }) => {
    expect(normalize(removeTimeblocks(previous, dates))).toEqual(expected);
  });
});

test('state-machine suites cannot regain static skips or todos', () => {
  const source = readFileSync(__filename, 'utf8');
  expect(source).not.toMatch(/\b(?:test|it|describe)\.(?:skip|todo)\s*\(/u);
  expect(
    durationCases.length + addCases.length + removalCases.length
  ).toBeGreaterThanOrEqual(25);
});
