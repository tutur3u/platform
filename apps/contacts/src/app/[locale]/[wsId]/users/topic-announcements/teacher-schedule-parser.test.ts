import { describe, expect, it } from 'vitest';
import {
  applySheetMerges,
  parseTeacherSchedule,
  splitTeacherClass,
} from './teacher-schedule-parser';

// Synthetic monthly teacher schedule: a title row, a header row with an
// AM/PM column and a combined teacher-class column, merged DAY/DATE cells
// (blank below the first row of each day) and a blank separator row.
const HEADER = [
  'DAY',
  'DATE',
  'TIME',
  'AM/PM',
  'TEACHER-CLASS',
  'PLACE',
  'ROOM',
  'TEACHER',
  'EMAIL',
];

function sheet() {
  return [
    ['Teacher schedule - month 10', '', '', '', '', '', '', '', ''],
    HEADER,
    [
      'MON',
      '5/10/2026',
      '5:30',
      'PM',
      'Alex Rivers - K1A',
      'Campus North',
      'R101',
      'Mai Tran',
      'alex.rivers@example.com',
    ],
    [
      '',
      '',
      '6:15',
      'PM',
      'Sam Lee - K2B',
      'Campus North',
      'R102',
      'Bao Le',
      '',
    ],
    ['', '', '', '', '', '', '', '', ''],
    [
      'TUE',
      '6/10/2026',
      '9',
      'AM',
      'Alex Rivers / K3C',
      'Campus South',
      'R201',
      'Mai Tran',
      '',
    ],
  ];
}

describe('parseTeacherSchedule', () => {
  it('detects the header below a title row and maps every column', () => {
    const result = parseTeacherSchedule(sheet());
    expect(result.kind).toBe('schedule');
    if (result.kind !== 'schedule') return;

    expect(result.headerRowNumber).toBe(2);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toEqual({
      errors: [],
      row: {
        classLabel: 'K1A',
        contactEmail: 'alex.rivers@example.com',
        contactName: 'Alex Rivers',
        dayLabel: 'MON',
        endTime: '18:00',
        place: 'Campus North',
        room: 'R101',
        sessionDate: '2026-10-05',
        startTime: '17:30',
        teacherName: 'Mai Tran',
      },
      sheetRowNumber: 3,
    });
  });

  it('forward-fills merged DAY and DATE cells and skips blank separator rows', () => {
    const result = parseTeacherSchedule(sheet());
    if (result.kind !== 'schedule') throw new Error('expected schedule');

    expect(result.rows[1]?.row).toMatchObject({
      dayLabel: 'MON',
      sessionDate: '2026-10-05',
      startTime: '18:15',
    });
    expect(result.rows[2]).toMatchObject({
      row: { dayLabel: 'TUE', sessionDate: '2026-10-06', startTime: '09:00' },
      sheetRowNumber: 6,
    });
  });

  it('applies the default 30 minute duration or the configured one', () => {
    const custom = parseTeacherSchedule(sheet(), { durationMinutes: 45 });
    if (custom.kind !== 'schedule') throw new Error('expected schedule');
    expect(custom.rows.map(({ row }) => row.endTime)).toEqual([
      '18:15',
      '19:00',
      '09:45',
    ]);
  });

  it('prefers an END TIME column over the default duration', () => {
    const result = parseTeacherSchedule([
      ['Date', 'Time', 'End time', 'Teacher class'],
      ['2026-10-05', '17:00', '18:30', 'Alex Rivers - K1A'],
    ]);
    if (result.kind !== 'schedule') throw new Error('expected schedule');
    expect(result.rows[0]?.row).toMatchObject({
      endTime: '18:30',
      startTime: '17:00',
    });
  });

  it('fills merged ranges from the sheet metadata', () => {
    const matrix = sheet();
    // Blank the second row's PLACE cell and declare it merged with the first.
    const secondSession = matrix[3];
    if (secondSession) secondSession[5] = '';
    const result = parseTeacherSchedule(matrix, {
      merges: [{ e: { c: 5, r: 3 }, s: { c: 5, r: 2 } }],
    });
    if (result.kind !== 'schedule') throw new Error('expected schedule');
    expect(result.rows[1]?.row.place).toBe('Campus North');
  });

  it('reads Excel date serials and time fractions', () => {
    const result = parseTeacherSchedule([
      ['Ngày', 'Giờ', 'Giáo viên - lớp', 'Phòng'],
      // 46300 is 2026-10-05; 0.75 is 18:00.
      [46_300, 0.75, 'Sam Lee - K2B', 'R102'],
    ]);
    if (result.kind !== 'schedule') throw new Error('expected schedule');
    expect(result.rows[0]?.row).toMatchObject({
      endTime: '18:30',
      room: 'R102',
      sessionDate: '2026-10-05',
      startTime: '18:00',
    });
  });

  it('returns per-row errors instead of throwing', () => {
    const result = parseTeacherSchedule([
      HEADER,
      ['MON', '', '5:30', 'PM', 'K1A', '', '', '', ''],
      ['MON', '31/2/2026', '13:30', 'AM', 'Alex Rivers - K1A', '', '', '', ''],
      ['MON', '5/10/2026', '', '', 'Alex Rivers - K1A', '', '', '', ''],
    ]);
    if (result.kind !== 'schedule') throw new Error('expected schedule');

    expect(result.rows.map(({ errors }) => errors)).toEqual([
      ['teacher_class_unsplit', 'missing_date'],
      ['bad_date', 'bad_time'],
      ['missing_time'],
    ]);
    expect(result.rows[0]?.row.classLabel).toBe('K1A');
    expect(result.rows[1]?.row.sessionDate).toBe('31/2/2026');
  });

  it('flags sessions whose default end time passes midnight', () => {
    const result = parseTeacherSchedule([
      ['Date', 'Time', 'Teacher'],
      ['2026-10-05', '23:45', 'Mai Tran'],
    ]);
    if (result.kind !== 'schedule') throw new Error('expected schedule');
    expect(result.rows[0]?.errors).toEqual(['bad_time']);
  });

  it('leaves generic announcement sheets to the generic importer', () => {
    expect(
      parseTeacherSchedule([
        ['date', 'start time', 'email', 'topic'],
        ['2026-10-05', '17:00', 'a@example.com', 'Unit 1'],
      ])
    ).toEqual({ kind: 'not_schedule' });
    expect(parseTeacherSchedule([])).toEqual({ kind: 'not_schedule' });
  });
});

describe('splitTeacherClass', () => {
  it.each([
    ['Alex Rivers - K1A', { classLabel: 'K1A', teacher: 'Alex Rivers' }],
    ['Alex Rivers – K1-A', { classLabel: 'K1-A', teacher: 'Alex Rivers' }],
    ['Alex/K1A', { classLabel: 'K1A', teacher: 'Alex' }],
    ['Alex Rivers | K1A', { classLabel: 'K1A', teacher: 'Alex Rivers' }],
  ])('splits %s', (value, expected) => {
    expect(splitTeacherClass(value)).toEqual(expected);
  });

  it('returns null without a separator', () => {
    expect(splitTeacherClass('K1A')).toBeNull();
    expect(splitTeacherClass(' - ')).toBeNull();
  });
});

describe('applySheetMerges', () => {
  it('clamps merges declared beyond the data area', () => {
    expect(
      applySheetMerges(
        [
          ['Mon', 'A'],
          ['', 'B'],
        ],
        [
          { e: { c: 16_383, r: 1_048_575 }, s: { c: 0, r: 0 } },
          { e: { c: 1, r: 1 }, s: { c: -5, r: -3 } },
          { e: { c: 9, r: 9 }, s: { c: 5, r: 5 } },
        ]
      )
    ).toEqual([
      ['Mon', 'A'],
      ['Mon', 'B'],
    ]);
  });

  it('copies the top-left value into blank merged cells only', () => {
    expect(
      applySheetMerges(
        [
          ['a', 'b'],
          ['', 'keep'],
        ],
        [{ e: { c: 1, r: 1 }, s: { c: 0, r: 0 } }]
      )
    ).toEqual([
      ['a', 'b'],
      ['a', 'keep'],
    ]);
  });
});
