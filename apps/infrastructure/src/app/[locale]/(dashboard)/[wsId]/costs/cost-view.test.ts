import type { InfrastructureCostsResponse } from '@tuturuuu/internal-api/infrastructure';
import { describe, expect, it } from 'vitest';
import {
  buildCostsView,
  dailyByProvider,
  financeTransactionUrl,
} from './cost-view';

const ROOT = '00000000-0000-0000-0000-000000000000';

const response = (
  overrides: Partial<InfrastructureCostsResponse> = {}
): InfrastructureCostsResponse => ({
  collection: { data: [], status: 'ok' },
  completeDays: { data: [], status: 'ok' },
  daily: { data: [], status: 'ok' },
  from: '2026-09-01',
  invoices: { data: [], status: 'ok' },
  lastCompleteDay: '2026-11-20',
  monthlyActiveUsers: { data: 100, status: 'ok' },
  recorded: { data: [], status: 'ok' },
  reportingMonth: '2026-11',
  rootWorkspaceId: ROOT,
  ...overrides,
});

const day = (date: string, provider: string, billedUsd: number) => ({
  app: 'web',
  billedUsd,
  day: date,
  environment: 'shared',
  listUsd: null,
  provider,
  service: 'usage',
});

describe('buildCostsView', () => {
  it('maps query states', () => {
    expect(buildCostsView({ status: 'pending' })).toEqual({ kind: 'loading' });
    expect(buildCostsView({ status: 'error' })).toEqual({ kind: 'error' });
    expect(buildCostsView({ data: response(), status: 'success' })).toEqual({
      coverage: {
        data: {
          collected: [],
          missing: expect.arrayContaining(['cloudflare']),
        },
        kind: 'ok',
      },
      kind: 'empty',
    });
  });

  it('keeps an unavailable source separate from measured data', () => {
    const view = buildCostsView({
      data: response({
        daily: { data: [day('2026-11-20', 'vercel', 1)], status: 'ok' },
        invoices: { status: 'unavailable' },
      }),
      status: 'success',
    });
    if (view.kind !== 'ready') throw new Error(view.kind);
    expect(view.invoices).toEqual({ kind: 'unavailable' });
    expect(view.overview).toMatchObject({
      data: { month: '2026-11', toDateUsd: 1 },
      kind: 'ok',
    });
  });

  it('divides trailing 30-day spend by monthly active users', () => {
    const trailing = Array.from({ length: 30 }, (_, index) => {
      const date = new Date('2026-11-20T00:00:00Z');
      date.setUTCDate(date.getUTCDate() - index);
      return date.toISOString().slice(0, 10);
    });
    const view = buildCostsView({
      data: response({
        completeDays: {
          data: [{ days: trailing, provider: 'vercel' }],
          status: 'ok',
        },
        daily: {
          data: [
            day('2026-11-20', 'vercel', 30),
            day('2026-10-01', 'vercel', 99),
          ],
          status: 'ok',
        },
      }),
      status: 'success',
    });
    if (view.kind !== 'ready' || view.overview.kind !== 'ok') throw new Error();
    expect(view.overview.data.spendPerActiveUserUsd).toEqual({
      data: 0.3,
      kind: 'ok',
    });
  });

  it('does not divide by zero active users', () => {
    const view = buildCostsView({
      data: response({
        daily: { data: [day('2026-11-20', 'vercel', 3)], status: 'ok' },
        monthlyActiveUsers: { data: 0, status: 'ok' },
      }),
      status: 'success',
    });
    if (view.kind !== 'ready' || view.overview.kind !== 'ok') throw new Error();
    expect(view.overview.data.spendPerActiveUserUsd).toEqual({
      data: null,
      kind: 'ok',
    });
  });

  it('lists inventory providers without a collector as coverage gaps', () => {
    const view = buildCostsView({
      data: response({
        collection: {
          data: [
            {
              days: 3,
              exhaustedDays: 0,
              firstDay: '2026-11-18',
              lastCollectedAt: '2026-11-21T03:17:00Z',
              lastDay: '2026-11-20',
              provider: 'github',
            },
          ],
          status: 'ok',
        },
        daily: { data: [day('2026-11-20', 'github', 0)], status: 'ok' },
      }),
      status: 'success',
    });
    if (view.kind !== 'ready' || view.coverage.kind !== 'ok') throw new Error();
    expect(view.coverage.data.missing).not.toContain('github');
    expect(view.coverage.data.missing).toContain('cloudflare');
  });
});

it('stacks daily billed totals per provider', () => {
  expect(
    dailyByProvider(
      [
        day('2026-11-02', 'vercel', 1),
        day('2026-11-01', 'github', 2),
        day('2026-11-01', 'vercel', 3),
      ].map((row) => ({ ...row, listUsd: 0 }))
    )
  ).toEqual({
    points: [
      { day: '2026-11-01', github: 2, vercel: 3 },
      { day: '2026-11-02', vercel: 1 },
    ],
    providers: ['github', 'vercel'],
  });
});

it('links only posted invoices to Finance', () => {
  const id = '22222222-0000-4000-8000-000000000000';
  expect(financeTransactionUrl('https://finance.tuturuuu.com', ROOT, id)).toBe(
    `https://finance.tuturuuu.com/${ROOT}/transactions/${id}`
  );
  expect(financeTransactionUrl('https://tuturuuu.com/finance', ROOT, id)).toBe(
    `https://tuturuuu.com/finance/${ROOT}/transactions/${id}`
  );
  expect(financeTransactionUrl('javascript:alert(1)', ROOT, id)).toBe(null);
  expect(
    financeTransactionUrl('https://finance.tuturuuu.com', ROOT, null)
  ).toBe(null);
  expect(
    financeTransactionUrl('https://finance.tuturuuu.com', ROOT, '../x')
  ).toBe(null);
});

it('marks the overview partial when collection days are unknown', () => {
  const view = buildCostsView({
    data: response({
      completeDays: { status: 'unavailable' },
      daily: { data: [day('2026-11-20', 'vercel', 1)], status: 'ok' },
    }),
    status: 'success',
  });
  if (view.kind !== 'ready' || view.overview.kind !== 'ok') throw new Error();
  expect(view.overview.data).toMatchObject({
    measured: { forecast: false, previous: false, toDate: false },
    partial: { forecast: true, previous: true, toDate: true },
  });
});

it('reports invoice-only data as unmeasured spend', () => {
  const view = buildCostsView({
    data: response({
      invoices: {
        data: [
          {
            accountId: 'org',
            amountUsd: 25,
            app: 'infra',
            financeTransactionId: null,
            issuedOn: '2026-11-03',
            provider: 'supabase',
            reference: 'INV-1',
          },
        ],
        status: 'ok',
      },
    }),
    status: 'success',
  });
  if (view.kind !== 'ready' || view.overview.kind !== 'ok') throw new Error();
  expect(view.overview.data.measured).toEqual({
    forecast: false,
    previous: false,
    toDate: false,
  });
  // Positive MAU must not turn unmeasured spend into $0 per user.
  expect(view.overview.data.spendPerActiveUserUsd).toEqual({
    data: null,
    kind: 'ok',
  });
});

it('marks spend collected from mid-month as partial', () => {
  const days = Array.from(
    { length: 7 },
    (_, index) => `2026-11-${String(14 + index).padStart(2, '0')}`
  );
  const view = buildCostsView({
    data: response({
      completeDays: { data: [{ days, provider: 'vercel' }], status: 'ok' },
      daily: {
        data: days.map((date) => day(date, 'vercel', 1)),
        status: 'ok',
      },
    }),
    status: 'success',
  });
  if (view.kind !== 'ready' || view.overview.kind !== 'ok') throw new Error();
  expect(view.overview.data).toMatchObject({
    measured: { forecast: true, previous: false, toDate: true },
    partial: { forecast: true, perUser: true, previous: true, toDate: true },
    spendPerActiveUserUsd: { data: 0.07, kind: 'ok' },
    toDateUsd: 7,
  });
});

it('treats providers with no completed days as unmeasured', () => {
  const view = buildCostsView({
    data: response({
      completeDays: { data: [{ days: [], provider: 'vercel' }], status: 'ok' },
      daily: { data: [day('2026-11-20', 'vercel', 1)], status: 'ok' },
    }),
    status: 'success',
  });
  if (view.kind !== 'ready' || view.overview.kind !== 'ok') throw new Error();
  expect(view.overview.data.measured).toEqual({
    forecast: false,
    previous: false,
    toDate: false,
  });
  expect(view.overview.data.spendPerActiveUserUsd).toEqual({
    data: null,
    kind: 'ok',
  });
});

it('measures each summary tile from its own period', () => {
  const november = Array.from(
    { length: 20 },
    (_, index) => `2026-11-${String(index + 1).padStart(2, '0')}`
  );
  const view = buildCostsView({
    data: response({
      completeDays: {
        data: [{ days: november, provider: 'vercel' }],
        status: 'ok',
      },
      daily: { data: [day('2026-11-20', 'vercel', 2)], status: 'ok' },
    }),
    status: 'success',
  });
  if (view.kind !== 'ready' || view.overview.kind !== 'ok') throw new Error();
  // November is verified; October has no verified day, so it is unmeasured.
  expect(view.overview.data.measured).toEqual({
    forecast: true,
    previous: false,
    toDate: true,
  });
  expect(view.overview.data.partial.toDate).toBe(false);
});

it('keeps a verified zero-spend window on the dashboard', () => {
  const trailing = Array.from({ length: 30 }, (_, index) => {
    const date = new Date('2026-11-20T00:00:00Z');
    date.setUTCDate(date.getUTCDate() - index);
    return date.toISOString().slice(0, 10);
  });
  const view = buildCostsView({
    data: response({
      completeDays: {
        data: [{ days: trailing, provider: 'github' }],
        status: 'ok',
      },
    }),
    status: 'success',
  });
  if (view.kind !== 'ready' || view.overview.kind !== 'ok')
    throw new Error(view.kind);
  expect(view.overview.data.toDateUsd).toBe(0);
  expect(view.overview.data.measured.toDate).toBe(true);
  expect(view.overview.data.spendPerActiveUserUsd).toEqual({
    data: 0,
    kind: 'ok',
  });
});

it('marks a first-of-month forecast partial when its inputs have gaps', () => {
  const view = buildCostsView({
    data: response({
      completeDays: {
        data: [{ days: ['2026-11-30'], provider: 'github' }],
        status: 'ok',
      },
      lastCompleteDay: '2026-11-30',
      reportingMonth: '2026-12',
    }),
    status: 'success',
  });
  if (view.kind !== 'ready' || view.overview.kind !== 'ok')
    throw new Error(view.kind);
  expect(view.overview.data.forecastUsd).toBe(0);
  expect(view.overview.data.partial.forecast).toBe(true);
});

it('does not claim an empty window when coverage cannot be verified', () => {
  const view = buildCostsView({
    data: response({ completeDays: { status: 'unavailable' } }),
    status: 'success',
  });
  if (view.kind !== 'ready' || view.overview.kind !== 'ok')
    throw new Error(view.kind);
  expect(view.overview.data.verificationUnavailable).toBe(true);
  expect(view.overview.data.measured).toEqual({
    forecast: false,
    previous: false,
    toDate: false,
  });
});

it('does not measure a forecast from a day outside its inputs', () => {
  const view = buildCostsView({
    data: response({
      completeDays: {
        data: [{ days: ['2027-01-30'], provider: 'github' }],
        status: 'ok',
      },
      lastCompleteDay: '2027-02-28',
      reportingMonth: '2027-03',
    }),
    status: 'success',
  });
  if (view.kind !== 'ready' || view.overview.kind !== 'ok')
    throw new Error(view.kind);
  expect(view.overview.data.measured.forecast).toBe(false);
});

it('withholds the breakdown when completion data is unavailable', () => {
  const view = buildCostsView({
    data: response({
      completeDays: { status: 'unavailable' },
      daily: { data: [day('2026-11-20', 'vercel', 42)], status: 'ok' },
    }),
    status: 'success',
  });
  if (view.kind !== 'ready') throw new Error(view.kind);
  expect(view.breakdown).toEqual({ kind: 'unavailable' });
});
