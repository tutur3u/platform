import { beforeEach, describe, expect, it, vi } from 'vitest';

const RAW_WORKSPACE_ID = 'personal';
const NORMALIZED_WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  authorizeInfrastructureMigrationExport: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('./migration-export-auth', () => ({
  authorizeInfrastructureMigrationExport:
    mocks.authorizeInfrastructureMigrationExport,
}));

function deny(status: number) {
  mocks.authorizeInfrastructureMigrationExport.mockResolvedValue({
    ok: false,
    response: Response.json({ message: 'Denied' }, { status }),
  });
}

function allow() {
  mocks.authorizeInfrastructureMigrationExport.mockResolvedValue({
    ok: true,
    value: {
      userId: 'user-1',
      wsId: NORMALIZED_WORKSPACE_ID,
    },
  });
}

function createRequest(path: string) {
  return new Request(
    `http://localhost/api/v1/infrastructure/${path}?ws_id=${RAW_WORKSPACE_ID}&offset=2&limit=3`
  );
}

function createSingleTableClient(data: unknown[]) {
  const range = vi
    .fn()
    .mockResolvedValue({ count: data.length, data, error: null });
  const eq = vi.fn(() => ({ range }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const schema = vi.fn(() => ({ from }));

  return {
    client: { schema },
    eq,
    from,
    range,
    schema,
    select,
  };
}

describe.each([
  {
    importRoute: () => import('./coupons/route'),
    path: 'coupons',
    table: 'workspace_promotions',
    wsColumn: 'ws_id',
  },
  {
    importRoute: () => import('./user-monthly-report-logs/route'),
    path: 'user-monthly-report-logs',
    table: 'external_user_monthly_report_logs_workspace_view',
    wsColumn: 'user_ws_id',
  },
  {
    importRoute: () => import('./user-monthly-reports/route'),
    path: 'user-monthly-reports',
    table: 'external_user_monthly_reports_workspace_view',
    wsColumn: 'user_ws_id',
  },
])(
  '$path infrastructure migration export route',
  ({ importRoute, path, table, wsColumn }) => {
    beforeEach(() => {
      vi.resetModules();
      vi.clearAllMocks();
    });

    it('rejects unauthorized requests before creating an admin client', async () => {
      deny(401);

      const { GET } = await importRoute();
      const response = await GET(createRequest(path));

      expect(response.status).toBe(401);
      expect(mocks.authorizeInfrastructureMigrationExport).toHaveBeenCalledWith(
        expect.any(Request),
        RAW_WORKSPACE_ID
      );
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    });

    it('queries private data only for the authorized normalized workspace', async () => {
      allow();
      const selectClient = createSingleTableClient([{ id: 'row-1' }]);
      mocks.createAdminClient.mockResolvedValue(selectClient.client);

      const { GET } = await importRoute();
      const response = await GET(createRequest(path));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        count: 1,
        data: [{ id: 'row-1' }],
      });
      expect(selectClient.schema).toHaveBeenCalledWith('private');
      expect(selectClient.from).toHaveBeenCalledWith(table);
      expect(selectClient.eq).toHaveBeenCalledWith(
        wsColumn,
        NORMALIZED_WORKSPACE_ID
      );
      expect(selectClient.range).toHaveBeenCalledWith(2, 4);
    });
  }
);

describe('user-coupons infrastructure migration export route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects forbidden requests before creating an admin client', async () => {
    deny(403);

    const { GET } = await import('./user-coupons/route');
    const response = await GET(createRequest('user-coupons'));

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('fetches user coupons through promotions scoped to the normalized workspace', async () => {
    allow();

    const linkedRange = vi.fn().mockResolvedValue({
      count: 1,
      data: [{ promo_id: 'promo-1', user_id: 'user-1' }],
      error: null,
    });
    const linkedIn = vi.fn(() => ({ range: linkedRange }));
    const promotionEq = vi.fn().mockResolvedValue({
      data: [{ id: 'promo-1', ws_id: NORMALIZED_WORKSPACE_ID }],
      error: null,
    });
    const promotionSelect = vi.fn(() => ({ eq: promotionEq }));
    const linkedSelect = vi.fn(() => ({ in: linkedIn }));
    const from = vi.fn((table: string) => {
      if (table === 'workspace_promotions') {
        return { select: promotionSelect };
      }

      if (table === 'user_linked_promotions') {
        return { select: linkedSelect };
      }

      return {};
    });
    const schema = vi.fn(() => ({ from }));
    mocks.createAdminClient.mockResolvedValue({ schema });

    const { GET } = await import('./user-coupons/route');
    const response = await GET(createRequest('user-coupons'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      count: 1,
      data: [
        {
          promo_id: 'promo-1',
          user_id: 'user-1',
          workspace_promotions: { ws_id: NORMALIZED_WORKSPACE_ID },
        },
      ],
    });
    expect(promotionEq).toHaveBeenCalledWith('ws_id', NORMALIZED_WORKSPACE_ID);
    expect(linkedIn).toHaveBeenCalledWith('promo_id', ['promo-1']);
    expect(linkedRange).toHaveBeenCalledWith(2, 4);
  });
});
