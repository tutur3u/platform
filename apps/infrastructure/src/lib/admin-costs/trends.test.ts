import { describe, expect, it } from 'vitest';
import {
  addDays,
  type CostWindow,
  type DailyCostRow,
  detectAnomalies,
  forecastMonth,
  monthlyTotals,
  trailingBilled,
} from './trends';

const row = (
  day: string,
  billedUsd: number,
  overrides: Partial<DailyCostRow> = {}
): DailyCostRow => ({
  app: 'web',
  billedUsd,
  day,
  environment: 'shared',
  listUsd: billedUsd,
  provider: 'vercel',
  service: 'Fluid Active CPU',
  ...overrides,
});

const days = (
  month: string,
  from: number,
  to: number,
  billed: number,
  overrides: Partial<DailyCostRow> = {}
) =>
  Array.from({ length: to - from + 1 }, (_, index) =>
    row(`${month}-${String(from + index).padStart(2, '0')}`, billed, overrides)
  );

const window = (
  lastCompleteDay: string,
  month = lastCompleteDay.slice(0, 7),
  completeDays?: CostWindow['completeDays']
): CostWindow => ({ completeDays, lastCompleteDay, month });

const complete = (provider: string, from: string, count: number) =>
  new Map([
    [
      provider,
      new Set(Array.from({ length: count }, (_, i) => addDays(from, i))),
    ],
  ]);

describe('monthlyTotals', () => {
  it('groups by month and dimension, largest first', () => {
    const totals = monthlyTotals(
      [
        row('2026-10-03', 1),
        row('2026-10-04', 2, { app: 'contacts' }),
        row('2026-10-05', 0.5, { app: 'contacts', listUsd: 3 }),
        row('2026-11-01', 4, { app: '' }),
      ],
      'app'
    );
    expect(totals).toEqual([
      { billedUsd: 2.5, key: 'contacts', listUsd: 5, month: '2026-10' },
      { billedUsd: 1, key: 'web', listUsd: 1, month: '2026-10' },
      { billedUsd: 4, key: 'shared', listUsd: 4, month: '2026-11' },
    ]);
  });
});

describe('forecastMonth', () => {
  it('extrapolates variable services and keeps fixed charges', () => {
    const rows = [
      ...days('2026-11', 1, 10, 1),
      row('2026-10-01', 20, { service: 'Pro' }),
      row('2026-11-01', 20, { service: 'Pro' }),
      row('2026-10-15', 5, { service: 'Seats' }),
    ];
    const [forecast] = forecastMonth(
      rows,
      window('2026-11-10', '2026-11', complete('vercel', '2026-10-01', 41))
    );
    // 10 to date + 20 days × $1, Pro as charged, Seats from last month.
    expect(forecast).toEqual({
      forecastUsd: 10 + 20 + 20 + 5,
      incomplete: false,
      key: 'vercel',
      measuredForecast: true,
      measuredPrevious: true,
      measuredToDate: true,
      month: '2026-11',
      partialPrevious: false,
      partialToDate: false,
      previousMonthUsd: 25,
      toDateUsd: 30,
    });
  });

  it('gives the same total in every dimension', () => {
    const rows = [
      row('2026-11-08', 1, { app: 'a' }),
      row('2026-11-09', 1, { app: 'b' }),
      row('2026-11-10', 1, { app: 'c' }),
    ];
    const sum = (dimension: 'provider' | 'app' | 'environment') =>
      forecastMonth(rows, window('2026-11-10'), dimension).reduce(
        (total, entry) => total + entry.forecastUsd,
        0
      );
    expect(sum('app')).toBeCloseTo(sum('provider'));
    expect(sum('environment')).toBeCloseTo(sum('provider'));
  });

  it('keeps a fixed charge netted to zero by a credit instead of last month', () => {
    const rows = [
      row('2026-10-01', 20, { service: 'Pro' }),
      row('2026-11-01', 20, { service: 'Pro' }),
      row('2026-11-01', -20, { service: 'Pro' }),
    ];
    const [forecast] = forecastMonth(rows, window('2026-11-10'));
    expect(forecast?.forecastUsd).toBe(0);
  });

  it('forecasts a new month with no elapsed days on its first day', () => {
    const rows = [...days('2026-11', 1, 30, 1)];
    const [forecast] = forecastMonth(rows, window('2026-11-30', '2026-12'));
    expect(forecast).toMatchObject({
      month: '2026-12',
      previousMonthUsd: 30,
      toDateUsd: 0,
    });
    expect(forecast?.forecastUsd).toBeCloseTo(31);
  });

  it('forecasts a closed month as its actuals', () => {
    const rows = [...days('2026-11', 1, 30, 1), row('2026-12-01', 50)];
    const [forecast] = forecastMonth(rows, window('2026-12-01', '2026-11'));
    expect(forecast?.forecastUsd).toBe(30);
    expect(forecast?.incomplete).toBe(false);
  });

  it('keeps charges on uncollected days out of the run rate', () => {
    const rows = [...days('2026-11', 8, 10, 1), row('2026-11-07', 90)];
    const [forecast] = forecastMonth(
      rows,
      window('2026-11-10', '2026-11', complete('vercel', '2026-11-08', 3))
    );
    // Rate is $1 a day from the three collected days, not ($3 + $90) / 3.
    expect(forecast?.forecastUsd).toBeCloseTo(93 + 1 * 20);
    expect(forecast?.incomplete).toBe(true);
  });

  it('projects fixed charges per app on the same service', () => {
    const rows = [
      row('2026-10-01', 20, { app: 'a', service: 'Seats' }),
      row('2026-10-01', 30, { app: 'b', service: 'Seats' }),
      row('2026-11-01', 20, { app: 'a', service: 'Seats' }),
    ];
    const [forecast] = forecastMonth(rows, window('2026-11-10'));
    expect(forecast?.forecastUsd).toBe(50);
  });

  it('averages only collected days and marks missing ones', () => {
    const rows = days('2026-11', 8, 10, 2);
    const [forecast] = forecastMonth(
      rows,
      window('2026-11-10', '2026-11', complete('vercel', '2026-11-01', 10))
    );
    // $6 over 7 collected days (four of them zero), 20 days left.
    expect(forecast?.forecastUsd).toBeCloseTo(6 + (6 / 7) * 20);
    expect(forecast?.incomplete).toBe(false);
    const [partial] = forecastMonth(
      rows,
      window('2026-11-10', '2026-11', complete('vercel', '2026-11-08', 3))
    );
    expect(partial?.forecastUsd).toBeCloseTo(6 + 2 * 20);
    expect(partial?.incomplete).toBe(true);
  });
});

describe('detectAnomalies', () => {
  it('flags a day far above the trailing median', () => {
    const rows = [...days('2026-11', 1, 14, 1), row('2026-11-15', 9)];
    expect(detectAnomalies(rows, window('2026-11-15'))).toContainEqual({
      baselineUsd: 1,
      billedUsd: 9,
      day: '2026-11-15',
      kind: 'daily-spike',
      provider: 'vercel',
    });
  });

  it('counts collected days without charges as a zero baseline', () => {
    const rows = [row('2026-11-15', 20)];
    expect(
      detectAnomalies(
        rows,
        window('2026-11-15', '2026-11', complete('vercel', '2026-11-01', 15))
      )
    ).toContainEqual(
      expect.objectContaining({ baselineUsd: 0, kind: 'daily-spike' })
    );
  });

  it('ignores small absolute spikes and short histories', () => {
    expect(
      detectAnomalies(
        [...days('2026-11', 1, 14, 0.1), row('2026-11-15', 0.9)],
        window('2026-11-15')
      )
    ).toEqual([]);
    expect(
      detectAnomalies(
        [row('2026-11-14', 1), row('2026-11-15', 50)],
        window('2026-11-15')
      )
    ).toEqual([]);
  });

  it('flags month growth against a fully collected previous month', () => {
    const rows = [...days('2026-10', 1, 31, 0.5), ...days('2026-11', 1, 10, 2)];
    const collected = complete('vercel', '2026-10-01', 41);
    expect(
      detectAnomalies(rows, window('2026-11-10', '2026-11', collected))
    ).toContainEqual(
      expect.objectContaining({
        kind: 'month-growth',
        month: '2026-11',
        provider: 'vercel',
      })
    );
  });

  it('does not flag growth without verified coverage of both months', () => {
    const rows = [...days('2026-10', 1, 31, 0.5), ...days('2026-11', 1, 10, 2)];
    const growth = (completeDays?: CostWindow['completeDays']) =>
      detectAnomalies(
        rows,
        window('2026-11-10', '2026-11', completeDays)
      ).filter((anomaly) => anomaly.kind === 'month-growth');
    expect(growth()).toEqual([]);
    // October is missing its first ten days.
    expect(growth(complete('vercel', '2026-10-11', 31))).toEqual([]);
  });

  it('does not flag growth from an incomplete run rate', () => {
    const rows = [...days('2026-10', 1, 31, 0.5), ...days('2026-11', 8, 10, 2)];
    expect(
      detectAnomalies(
        rows,
        window('2026-11-10', '2026-11', complete('vercel', '2026-11-08', 3))
      ).filter((anomaly) => anomaly.kind === 'month-growth')
    ).toEqual([]);
  });
});

it('sums the trailing billed window', () => {
  expect(trailingBilled(days('2026-11', 1, 20, 1), '2026-11-20', 7)).toBe(7);
});

describe('coverage of each period', () => {
  it('marks a month collected from the middle as partial', () => {
    const rows = days('2026-11', 14, 20, 1);
    const [forecast] = forecastMonth(
      rows,
      window('2026-11-20', '2026-11', complete('vercel', '2026-11-14', 7))
    );
    expect(forecast).toMatchObject({
      incomplete: true,
      measuredPrevious: false,
      measuredToDate: true,
      partialPrevious: true,
      partialToDate: true,
    });
  });

  it('marks a forecast carrying a partial previous month as incomplete', () => {
    const rows = [row('2026-10-20', 5, { service: 'Seats' })];
    const [forecast] = forecastMonth(
      rows,
      window('2026-11-10', '2026-11', complete('vercel', '2026-10-20', 22))
    );
    expect(forecast).toMatchObject({
      forecastUsd: 5,
      incomplete: true,
      partialPrevious: true,
      partialToDate: false,
    });
  });
});

it('does not measure a breakdown forecast without verified input days', () => {
  const [forecast] = forecastMonth(
    [row('2027-02-27', 42)],
    window('2027-02-28', '2027-03', complete('vercel', '2027-01-30', 1))
  );
  expect(forecast?.measuredForecast).toBe(false);
});
