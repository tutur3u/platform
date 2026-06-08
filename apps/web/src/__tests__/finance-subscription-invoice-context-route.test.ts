import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFinanceRouteContext: vi.fn(),
  resolveFinanceRouteAuthContext: vi.fn(),
  serverError: vi.fn(),
}));

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: (
    ...args: Parameters<typeof mocks.getFinanceRouteContext>
  ) => mocks.getFinanceRouteContext(...args),
}));

vi.mock('@/lib/finance-route-auth', () => ({
  resolveFinanceRouteAuthContext: (
    ...args: Parameters<typeof mocks.resolveFinanceRouteAuthContext>
  ) => mocks.resolveFinanceRouteAuthContext(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverError>) =>
      mocks.serverError(...args),
  },
}));

const repoRoot = process.cwd().endsWith('/apps/web')
  ? resolve(process.cwd(), '../..')
  : process.cwd();

const subscriptionContextRoutePath = resolve(
  repoRoot,
  'apps/web/src/app/api/v1/workspaces/[wsId]/finance/invoices/subscription/context/route.ts'
);

function createThenableQuery<T>(response: T) {
  const promise = Promise.resolve(response);
  const query = {
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    in: vi.fn(() => query),
    lt: vi.fn(() => query),
    not: vi.fn(() => query),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
  return query;
}

function withPermissions(granted: string[]) {
  return {
    withoutPermission: vi.fn(
      (permission: string) => !granted.includes(permission)
    ),
  };
}

describe('subscription invoice context route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.resolveFinanceRouteAuthContext.mockResolvedValue({});
  });

  it('uses only completed invoices as paid subscription coverage', () => {
    const source = readFileSync(subscriptionContextRoutePath, 'utf8');

    expect(source).toContain(
      'finance_invoices!inner(valid_until, created_at, completed_at)'
    );
    expect(source).toContain(
      ".not('finance_invoices.completed_at', 'is', null)"
    );
  });

  it('returns the completed invoice with the furthest valid_until for each group', async () => {
    const validGroupsQuery = createThenableQuery({
      data: [{ group_id: 'group-1' }],
      error: null,
    });
    const attendanceQuery = createThenableQuery({
      data: [],
      error: null,
    });
    const latestInvoicesQuery = createThenableQuery({
      data: [
        {
          finance_invoices: {
            completed_at: null,
            created_at: '2026-07-10T00:00:00.000Z',
            valid_until: '2026-08-01',
          },
          user_group_id: 'group-1',
        },
        {
          finance_invoices: {
            completed_at: '2026-06-10T00:00:00.000Z',
            created_at: '2026-06-10T00:00:00.000Z',
            valid_until: '2026-06-01',
          },
          user_group_id: 'group-1',
        },
        {
          finance_invoices: {
            completed_at: '2026-08-10T00:00:00.000Z',
            created_at: '2026-08-10T00:00:00.000Z',
            valid_until: null,
          },
          user_group_id: 'group-1',
        },
        {
          finance_invoices: {
            completed_at: '2026-05-10T00:00:00.000Z',
            created_at: '2026-05-10T00:00:00.000Z',
            valid_until: '2026-07-01',
          },
          user_group_id: 'group-1',
        },
      ],
      error: null,
    });

    const sbAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'workspace_user_groups_users') return validGroupsQuery;
        if (table === 'user_group_attendance') return attendanceQuery;
        if (table === 'finance_invoice_user_groups') {
          return latestInvoicesQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: withPermissions(['create_invoices']),
        sbAdmin,
      },
    });

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/finance/invoices/subscription/context/route'
    );
    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/finance/invoices/subscription/context?userId=user-1&month=2026-06&groupIds=group-1'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      attendance: [],
      latestInvoices: [
        {
          created_at: '2026-05-10T00:00:00.000Z',
          group_id: 'group-1',
          valid_until: '2026-07-01',
        },
      ],
    });
    expect(latestInvoicesQuery.not).toHaveBeenCalledWith(
      'finance_invoices.completed_at',
      'is',
      null
    );
  });
});
