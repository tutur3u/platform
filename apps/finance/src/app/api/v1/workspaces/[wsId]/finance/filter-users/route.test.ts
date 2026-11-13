import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  auth: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
}));
vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: mocks.access,
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: mocks.auth,
}));

import { GET } from './route';

const legacy = {
  id: 'legacy',
  display_name: null,
  full_name: null,
  email: null,
  avatar_url: null,
};
const platform = {
  id: 'platform',
  display_name: 'Current profile name',
  avatar_url: null,
  user_private_details: null,
};
const request = () =>
  GET(
    new Request(
      'http://localhost/api/v1/workspaces/ws/finance/filter-users?type=invoice_creators'
    ),
    { params: Promise.resolve({ wsId: 'alias' }) }
  );

function rows(data: unknown[]) {
  mocks.range.mockResolvedValue({ data, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({});
  mocks.access.mockResolvedValue({
    context: {
      normalizedWsId: 'workspace',
      permissions: { withoutPermission: () => false },
      sbAdmin: { from: mocks.from },
    },
  });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ order: mocks.order });
  mocks.order.mockReturnValue({ range: mocks.range });
  mocks.range.mockResolvedValue({ data: [], error: null });
});

describe('invoice creator options', () => {
  it('requires invoice access even when transaction access is granted', async () => {
    mocks.access.mockResolvedValue({
      context: {
        permissions: {
          withoutPermission: (permission: string) =>
            permission === 'view_invoices',
        },
        sbAdmin: { from: mocks.from },
      },
    });
    const response = await request();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: 'Unauthorized' });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    [
      'renamed linked creator',
      legacy,
      platform,
      'legacy',
      'Current profile name',
    ],
    [
      'platform-only creator',
      null,
      platform,
      'platform',
      'Current profile name',
    ],
    [
      'legacy full-name fallback',
      { ...legacy, full_name: 'Legacy name' },
      null,
      'legacy',
      'Legacy name',
    ],
    ['missing name', legacy, null, 'legacy', null],
  ])(
    'resolves %s like the invoice table',
    async (_case, legacyCreator, platformCreator, id, name) => {
      const data = [
        {
          creator_id: legacyCreator?.id ?? null,
          platform_creator_id: platformCreator?.id ?? null,
          legacy_creator: legacyCreator,
          platform_creator: platformCreator,
        },
      ];
      rows(data);
      const response = await request();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        users: [{ id, display_name: name }],
      });
      expect(mocks.from).toHaveBeenCalledWith('finance_invoices');
      expect(mocks.eq).toHaveBeenCalledWith('ws_id', 'workspace');
    }
  );

  it('deduplicates creators across pages without returning private profile fields', async () => {
    const invoice = {
      creator_id: legacy.id,
      platform_creator_id: platform.id,
      legacy_creator: legacy,
      platform_creator: platform,
    };
    mocks.range
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, () => invoice),
        error: null,
      })
      .mockResolvedValueOnce({
        data: [invoice, { ...invoice, creator_id: 'second' }],
        error: null,
      });
    expect(await (await request()).json()).toEqual({
      users: [
        { id: 'legacy', display_name: 'Current profile name' },
        { id: 'second', display_name: 'Current profile name' },
      ],
    });
    expect(mocks.range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('returns an error rather than partial options when a page fails', async () => {
    mocks.range.mockResolvedValue({
      data: null,
      error: { message: 'unavailable' },
    });
    expect((await request()).status).toBe(500);
  });

  it('does not query when access is denied', async () => {
    mocks.access.mockResolvedValue({
      response: new Response(null, { status: 401 }),
    });
    expect((await request()).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('retains the existing permission gate', async () => {
    mocks.access.mockResolvedValue({
      context: { permissions: { withoutPermission: () => true } },
    });
    expect((await request()).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
