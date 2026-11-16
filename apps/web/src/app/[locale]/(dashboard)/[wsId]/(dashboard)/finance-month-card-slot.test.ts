import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requestHeaders: new Headers(),
  getWorkspaceConfig: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: async () => mocks.requestHeaders,
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceConfig: mocks.getWorkspaceConfig,
}));

import {
  loadFinanceMonthState,
  RECENT_TRANSACTION_LIMIT,
} from './finance-month-card-slot';

const FINANCE_ORIGIN = 'https://finance.example.test';
// 23:30 UTC on 31 Oct is 1 Nov in the workspace zone (UTC+7).
const now = new Date('2026-10-31T23:30:00.000Z');

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const STATS = {
  totalTransactions: 3,
  totalIncome: 18_200_000,
  totalExpense: -12_480_000,
  netTotal: 5_720_000,
  hasRedactedAmounts: true,
};
const ROWS = [
  { id: 't1', amount: -320_000, description: 'Groceries', taken_at: '2026-10-31T20:00:00Z' },
  { id: 't2', amount: null, description: null, category: 'Salary', taken_at: '2026-10-30T02:00:00Z' },
];

describe('dashboard finance transport', () => {
  const fetchMock = vi.fn();
  const byPath = (path: string) =>
    fetchMock.mock.calls.find(([input]) => new URL(String(input)).pathname === path);

  beforeEach(() => {
    vi.stubEnv('FINANCE_APP_URL', FINANCE_ORIGIN);
    vi.stubGlobal('fetch', fetchMock);
    mocks.requestHeaders = new Headers({ authorization: 'Bearer viewer-token' });
    mocks.getWorkspaceConfig.mockResolvedValue('VND');
    fetchMock.mockImplementation(async (input: string) =>
      new URL(String(input)).pathname.endsWith('/stats')
        ? jsonResponse(STATS)
        : jsonResponse(ROWS)
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('reads the workspace-zone month and the latest rows with the viewer session', async () => {
    const state = await loadFinanceMonthState('ws-1', 'Asia/Ho_Chi_Minh', now);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const stats = byPath('/api/workspaces/ws-1/transactions/stats')!;
    const list = byPath('/api/workspaces/ws-1/transactions')!;
    for (const [input, init] of [stats, list]) {
      expect(new URL(String(input)).origin).toBe(FINANCE_ORIGIN);
      // Forwarded by the existing allowlisted helper, not browser credentials.
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer viewer-token');
      expect(init).not.toHaveProperty('credentials');
    }
    expect(Object.fromEntries(new URL(String(stats[0])).searchParams)).toEqual({
      start: '2026-10-31T17:00:00.000Z',
      end: '2026-11-30T16:59:59.999Z',
    });
    expect(Object.fromEntries(new URL(String(list[0])).searchParams)).toEqual({
      page: '1',
      itemsPerPage: String(RECENT_TRANSACTION_LIMIT),
    });

    expect(state).toEqual({
      status: 'ready',
      income: 18_200_000,
      expense: 12_480_000,
      currency: 'VND',
      locale: 'en',
      redacted: true,
      monthLabel: 'November',
      timeZone: 'Asia/Ho_Chi_Minh',
      recent: [
        { id: 't1', label: 'Groceries', amount: -320_000, takenAt: '2026-10-31T20:00:00Z' },
        { id: 't2', label: 'Salary', amount: null, takenAt: '2026-10-30T02:00:00Z' },
      ],
    });
  });

  it('uses UTC when the workspace zone is automatic', async () => {
    const state = await loadFinanceMonthState('ws-1', 'auto', now);
    const stats = byPath('/api/workspaces/ws-1/transactions/stats')!;
    expect(new URL(String(stats[0])).searchParams.get('start')).toBe(
      '2026-10-01T00:00:00.000Z'
    );
    expect(state).toMatchObject({ timeZone: 'UTC', monthLabel: 'October' });
  });

  it('keeps totals when only the recent list fails, and errors when totals fail', async () => {
    fetchMock.mockImplementation(async (input: string) =>
      new URL(String(input)).pathname.endsWith('/stats')
        ? jsonResponse(STATS)
        : jsonResponse({ message: 'Insufficient permissions' }, 403)
    );
    await expect(loadFinanceMonthState('ws-1', 'UTC', now)).resolves.toMatchObject({
      status: 'ready',
      recent: null,
    });

    fetchMock.mockImplementation(async () =>
      jsonResponse({ message: 'Unauthorized' }, 403)
    );
    await expect(loadFinanceMonthState('ws-1', 'UTC', now)).resolves.toEqual({
      status: 'error',
    });
  });
});
