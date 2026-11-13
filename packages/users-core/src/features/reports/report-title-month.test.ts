import { describe, expect, it } from 'vitest';
import {
  isReportTitleMonthKey,
  matchesReportTitleMonth,
  NO_TITLE_MONTH,
  parseReportTitleMonth,
  parseReportTitleMonthKey,
  reportTitleMonthKey,
  summarizeReportTitleMonths,
} from './report-title-month';

describe('parseReportTitleMonth', () => {
  it.each([
    ['Báo cáo tháng 9', { month: 9, year: null }],
    ['Báo cáo tháng 10', { month: 10, year: null }],
    ['Tháng 9', { month: 9, year: null }],
    ['THÁNG 9', { month: 9, year: null }],
    ['báo cáo thang 9', { month: 9, year: null }],
    ['Báo cáo tháng 09', { month: 9, year: null }],
    ['Báo cáo tháng  9 của bé', { month: 9, year: null }],
    ['Báo cáo tháng 9/2026', { month: 9, year: 2026 }],
    ['Báo cáo tháng 9 - 2026', { month: 9, year: 2026 }],
    ['Báo cáo tháng 9-2026', { month: 9, year: 2026 }],
    ['Báo cáo tháng 9.2026', { month: 9, year: 2026 }],
    ['Báo cáo tháng 9, 2026', { month: 9, year: 2026 }],
    ['Báo cáo tháng 10 năm 2026', { month: 10, year: 2026 }],
    ['Báo cáo THÁNG 12/2025', { month: 12, year: 2025 }],
    ['Báo cáo tháng 1', { month: 1, year: null }],
    // Decomposed (NFD) diacritics are folded the same way.
    ['Báo cáo tháng 9'.normalize('NFD'), { month: 9, year: null }],
    // A two-digit or out-of-range year is not a year.
    ['Báo cáo tháng 9/26', { month: 9, year: null }],
    ['Báo cáo tháng 9/1850', { month: 9, year: null }],
    // The first valid month wins; an invalid one is skipped.
    ['tháng 13 hoặc tháng 4', { month: 4, year: null }],
  ])('%s', (title, expected) => {
    expect(parseReportTitleMonth(title)).toEqual(expected);
  });

  it.each([
    [''],
    ['Báo cáo định kỳ'],
    ['Báo cáo tháng'],
    ['Báo cáo tháng 0'],
    ['Báo cáo tháng 13'],
    ['Báo cáo tháng 123'],
    ['Báo cáo tháng chín'],
    ['Báo cáo mùa hè 9'],
    ['Báo cáo xtháng 9'],
    [null],
    [undefined],
  ])('finds no month in %j', (title) => {
    expect(parseReportTitleMonth(title)).toBeNull();
  });
});

describe('title month keys', () => {
  it('files a title under a YYYY-MM, MM or none key', () => {
    expect(reportTitleMonthKey('Báo cáo tháng 9/2026')).toBe('2026-09');
    expect(reportTitleMonthKey('Báo cáo tháng 9')).toBe('09');
    expect(reportTitleMonthKey('Báo cáo tháng 10')).toBe('10');
    expect(reportTitleMonthKey('Báo cáo định kỳ')).toBe(NO_TITLE_MONTH);
    expect(reportTitleMonthKey(null)).toBe(NO_TITLE_MONTH);
  });

  it('validates and parses keys', () => {
    for (const key of ['2026-09', '09', '12', 'none'])
      expect(isReportTitleMonthKey(key)).toBe(true);
    for (const key of ['', '9', '13', '00', '2026-13', '2026-9', 'all', 5])
      expect(isReportTitleMonthKey(key)).toBe(false);
    expect(parseReportTitleMonthKey('2026-09')).toEqual({
      month: 9,
      year: 2026,
    });
    expect(parseReportTitleMonthKey('09')).toEqual({ month: 9, year: null });
    expect(parseReportTitleMonthKey('none')).toBeNull();
  });

  it('matches a title to its own key only', () => {
    expect(matchesReportTitleMonth('Báo cáo tháng 9', '09')).toBe(true);
    expect(matchesReportTitleMonth('Báo cáo tháng 9', '2026-09')).toBe(false);
    expect(matchesReportTitleMonth('Báo cáo tháng 9', '10')).toBe(false);
    expect(matchesReportTitleMonth('Báo cáo', NO_TITLE_MONTH)).toBe(true);
  });
});

describe('summarizeReportTitleMonths', () => {
  it('counts every report under the month its title names', () => {
    expect(
      summarizeReportTitleMonths([
        'Báo cáo tháng 9',
        'Báo cáo tháng 9',
        'Tháng 9',
        'Báo cáo tháng 10',
        'Báo cáo tháng 10/2026',
        'Báo cáo tháng 9/2026',
        'Báo cáo tháng 9/2026',
        'Báo cáo cuối kỳ',
        null,
      ])
    ).toEqual([
      { key: '2026-10', count: 1 },
      { key: '2026-09', count: 2 },
      { key: '10', count: 1 },
      { key: '09', count: 3 },
      { key: 'none', count: 2 },
    ]);
  });

  it('sums to the number of reports and is empty for none', () => {
    const titles = ['a', 'tháng 1', 'tháng 2', 'tháng 2', 'tháng 12/2025'];
    expect(
      summarizeReportTitleMonths(titles).reduce((sum, m) => sum + m.count, 0)
    ).toBe(titles.length);
    expect(summarizeReportTitleMonths([])).toEqual([]);
  });

  it('keeps a lone Báo cáo tháng 9 at the right count', () => {
    expect(summarizeReportTitleMonths(['Báo cáo tháng 9'])).toEqual([
      { key: '09', count: 1 },
    ]);
  });
});
