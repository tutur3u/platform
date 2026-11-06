import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  permissions: vi.fn(),
  finance: vi.fn(),
  memberships: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
  normalizeWorkspaceId: async () => 'ws-a',
  verifySecret: vi.fn(),
}));
vi.mock('../../src/lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.permissions,
}));
vi.mock('../../src/lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: async () => 'ws-a',
  resolveRequestActorAuthUid: async () => 'actor',
  hasUserGroupInWorkspace: async () => true,
}));
vi.mock('../../src/lib/user-groups/groups-utils', () => ({
  getUserGroupMembershipsForActor: mocks.memberships,
}));
vi.mock('../../src/lib/user-groups/revalidate', () => ({
  revalidateUserGroupCache: vi.fn(),
}));
vi.mock('@/lib/user-groups/revalidate', () => ({
  revalidateUserGroupCache: vi.fn(),
}));
vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: mocks.finance,
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: vi.fn(),
}));
vi.mock('../../src/reports/email-preview', () => ({
  loadReportEmailPreview: vi.fn(),
}));

import {
  POST as inventoryLink,
  GET as inventoryRead,
} from '../../../../apps/inventory/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/linked-products/route';
import { GET as webLogs } from '../../../../apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/users/reports/[reportId]/logs/route';
import { GET as webExport } from '../../../../apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/users/reports/groups/[groupId]/bulk-export/route';
import { PATCH as changeLink } from '../../src/routes/user-groups/[groupId]/linked-products/[productId]/route';
import {
  GET as coreRead,
  POST as link,
} from '../../src/routes/user-groups/[groupId]/linked-products/route';
import { GET as reportDelivery } from '../../src/routes/users/reports/[reportId]/delivery/route';
import { GET as reportLogs } from '../../src/routes/users/reports/[reportId]/logs/route';
import { GET as exportReports } from '../../src/routes/users/reports/groups/[groupId]/bulk-export/route';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
const writes = vi.fn();
const own = '11111111-1111-4111-8111-111111111111';
const foreign = '22222222-2222-4222-8222-222222222222';
function query(initial: Row[]) {
  let rows = initial;
  const q = {
    select: () => q,
    eq: (key: string, value: unknown) => {
      rows = rows.filter(
        (row) =>
          key
            .split('.')
            .reduce<unknown>(
              (current, part) =>
                current && typeof current === 'object'
                  ? Reflect.get(current, part)
                  : undefined,
              row
            ) === value
      );
      return q;
    },
    in: (key: string, values: unknown[]) => {
      rows = rows.filter((row) => values.includes(row[key]));
      return q;
    },
    order: () => q,
    limit: () => q,
    insert: (payload: unknown) => {
      writes(payload);
      return q;
    },
    update: (payload: unknown) => {
      writes(payload);
      return q;
    },
    single: async () => ({ data: rows[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    // biome-ignore lint/suspicious/noThenProperty: Supabase builders are awaitable.
    then: (
      resolve: (result: { data: Row[]; error: null; count: number }) => unknown
    ) =>
      Promise.resolve(resolve({ data: rows, error: null, count: rows.length })),
  };
  return q;
}
const db = {
  from: vi.fn((name: string) => query(tables[name] ?? [])),
  schema: (_name: string): typeof db => db,
};
function allow(manager = false) {
  const permissions = {
    wsId: 'ws-a',
    containsPermission: (name: string) => name !== 'manage_users' || manager,
    withoutPermission: (name: string) => name === 'manage_users' && !manager,
  };
  mocks.permissions.mockResolvedValue(permissions);
  mocks.finance.mockResolvedValue({
    context: { normalizedWsId: 'ws-a', sbAdmin: db, permissions },
  });
}
function params(groupId = 'group-a', reportId = 'report-a') {
  return {
    params: Promise.resolve({
      wsId: 'ws-a',
      groupId,
      reportId,
      productId: own,
    }),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue(db);
  mocks.memberships.mockResolvedValue(['group-a']);
  allow();
  tables = {};
  for (const table of [
    'workspace_products',
    'inventory_warehouses',
    'inventory_units',
  ])
    tables[table] = [
      { id: own, ws_id: 'ws-a' },
      { id: foreign, ws_id: 'ws-b' },
    ];
  tables.inventory_products = [
    { product_id: own, warehouse_id: own, unit_id: own },
  ];
  tables.workspace_user_groups = [{ id: 'group-a', ws_id: 'ws-a' }];
  const reports = ['a', 'b'].map((suffix) => ({
    id: `report-${suffix}`,
    report_id: `report-${suffix}`,
    user_ws_id: 'ws-a',
    group_ws_id: 'ws-a',
    group_id: `group-${suffix}`,
    title: 'Synthetic',
    content: `content-${suffix}`,
  }));
  tables.external_user_monthly_reports_workspace_view = reports;
  tables.external_user_monthly_report_logs_workspace_view = reports;
});
describe('linked product workspace scope', () => {
  for (const [name, handler] of [
    ['SR-212 contacts POST', link],
    ['SR-212 contacts PATCH', changeLink],
    ['SR-233 inventory POST', inventoryLink],
  ] as const) {
    it.each(['productId', 'warehouseId', 'unitId'])(
      `${name} rejects a foreign %s before mutation`,
      async (key) => {
        const body = {
          productId: own,
          warehouseId: own,
          unitId: own,
          [key]: foreign,
        };
        const response = await handler(
          new Request('https://example.invalid/products', {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          name.includes('PATCH') && key === 'productId'
            ? {
                params: Promise.resolve({
                  wsId: 'ws-a',
                  groupId: 'group-a',
                  reportId: 'report-a',
                  productId: foreign,
                }),
              }
            : params()
        );
        expect(response.status).toBe(400);
        expect(writes).not.toHaveBeenCalled();
      }
    );
    it(`${name} retains a valid inventory combination`, async () => {
      const response = await handler(
        new Request('https://example.invalid/products', {
          method: 'POST',
          body: JSON.stringify({
            productId: own,
            warehouseId: own,
            unitId: own,
          }),
        }),
        params()
      );
      expect(response.status).toBe(200);
      expect(writes).toHaveBeenCalled();
    });
  }
});
describe('SR-218 report group access', () => {
  for (const [name, handler, isExport] of [
    ['contacts export', exportReports, true],
    ['web export', webExport, true],
    ['contacts logs', reportLogs, false],
    ['web logs', webLogs, false],
    ['delivery', reportDelivery, false],
  ] as const) {
    it(`${name} withholds reports outside the actor's groups`, async () => {
      const response = await handler(
        new Request('https://example.invalid/reports?title=Synthetic'),
        params('group-b', 'report-b')
      );
      const body = await response.json();
      expect(
        [403, 404].includes(response.status) ||
          (Array.isArray(body) && body.length === 0)
      ).toBe(true);
    });
    it(`${name} retains the actor's own reports`, async () => {
      const response = await handler(
        new Request('https://example.invalid/reports?title=Synthetic'),
        params()
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(
        isExport || name.includes('logs')
          ? body[0].content
          : body.report.content
      ).toBe('content-a');
    });
    it(`${name} allows workspace user managers across groups`, async () => {
      allow(true);
      const response = await handler(
        new Request('https://example.invalid/reports?title=Synthetic'),
        params('group-b', 'report-b')
      );
      expect(response.status).toBe(200);
    });
  }
});

it.each([coreRead, inventoryRead])(
  'does not return preexisting foreign catalog links',
  async (handler) => {
    tables.user_group_linked_products = [
      {
        group_id: 'group-a',
        warehouse_id: own,
        unit_id: own,
        workspace_products: { id: own, name: 'Own catalog', ws_id: 'ws-a' },
      },
      {
        group_id: 'group-a',
        warehouse_id: foreign,
        unit_id: foreign,
        workspace_products: {
          id: foreign,
          name: 'Foreign catalog',
          ws_id: 'ws-b',
        },
      },
    ];
    const response = await handler(
      new Request('https://example.invalid/products'),
      params()
    );
    expect(response.status).toBe(200);
    expect(
      (await response.json()).items.map((item: { id: string }) => item.id)
    ).toEqual([own]);
  }
);

it.each([link, changeLink, inventoryLink])(
  'rejects a missing inventory combination before mutation',
  async (handler) => {
    tables.inventory_products = [];
    const response = await handler(
      new Request('https://example.invalid/products', {
        method: 'POST',
        body: JSON.stringify({ productId: own, warehouseId: own, unitId: own }),
      }),
      params()
    );
    expect(response.status).toBe(400);
    expect(writes).not.toHaveBeenCalled();
  }
);
it.each([exportReports, webExport, reportLogs, webLogs, reportDelivery])(
  'requires both report subject and group workspace even for managers',
  async (handler) => {
    allow(true);
    for (const table of [
      'external_user_monthly_reports_workspace_view',
      'external_user_monthly_report_logs_workspace_view',
    ]) {
      tables[table] = [
        {
          id: 'report-a',
          report_id: 'report-a',
          user_ws_id: 'ws-a',
          group_ws_id: 'ws-b',
          group_id: 'group-a',
          title: 'Synthetic',
          content: 'mixed',
        },
      ];
    }
    const response = await handler(
      new Request('https://example.invalid/reports?title=Synthetic'),
      params()
    );
    const body = await response.json();
    expect(
      [403, 404].includes(response.status) ||
        (Array.isArray(body) && body.length === 0)
    ).toBe(true);
  }
);
