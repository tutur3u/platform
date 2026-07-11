import { describe, expect, it } from 'vitest';
import {
  buildScheduleSummarySearchText,
  matchesGroupedTimeblockSearch,
} from './grouped-session-timeblock-utils';

describe('grouped-session-timeblock-utils', () => {
  it('matches Vietnamese names without accents', () => {
    expect(matchesGroupedTimeblockSearch(['MS. HƯỞNG'], 'huong')).toBe(true);
    expect(matchesGroupedTimeblockSearch(['ĐẶNG THỊ DUYÊN'], 'dang')).toBe(
      true
    );
  });

  it('tolerates small fuzzy typos for longer tokens', () => {
    expect(matchesGroupedTimeblockSearch(['MS. TUYẾT'], 'tuyt')).toBe(true);
    expect(matchesGroupedTimeblockSearch(['EGET2'], 'eget')).toBe(true);
  });

  it('matches ordered query tokens across group and roster text', () => {
    expect(
      matchesGroupedTimeblockSearch(
        ['246-EGET0 - MS HƯỞNG', 'manager@example.com'],
        'eget huong'
      )
    ).toBe(true);
  });

  it('adds compact schedule details to the search text', () => {
    const searchText = buildScheduleSummarySearchText(
      {
        exceptionCount: 1,
        groupId: 'group-1',
        managerCount: 2,
        nonManagerCount: 12,
        patterns: [
          {
            daysOfWeek: [2, 4],
            endTime: '08:00',
            exceptionCount: 0,
            expectedCount: 8,
            occurrenceCount: 8,
            startTime: '07:00',
          },
        ],
        upcomingCount: 9,
      },
      'en'
    );

    expect(matchesGroupedTimeblockSearch([searchText], 'Tue 07:00')).toBe(true);
    expect(matchesGroupedTimeblockSearch([searchText], 'exceptions')).toBe(
      true
    );
  });
});
