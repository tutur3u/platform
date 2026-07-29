import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getPermissions: vi.fn(),
  getSatelliteAppSessionUser: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, connection: mocks.connection };
});

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: (...args: unknown[]) =>
    mocks.getSatelliteAppSessionUser(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: unknown[]) => mocks.getPermissions(...args),
}));

vi.mock('@/components/operator/inventory-operator-client', () => ({
  InventoryOperatorClient: ({
    canExportSales,
  }: {
    canExportSales?: boolean;
  }) => <div data-can-export={String(Boolean(canExportSales))} />,
}));

function permissionsWith(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

describe('Inventory sales page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSatelliteAppSessionUser.mockResolvedValue({ id: 'user-1' });
  });

  it('passes export access only when both required permissions are present', async () => {
    mocks.getPermissions.mockResolvedValue(
      permissionsWith(['view_inventory_sales', 'export_finance_data'])
    );
    const { default: InventorySalesPage } = await import('./page');
    const html = renderToStaticMarkup(
      await InventorySalesPage({ params: Promise.resolve({ wsId: 'ws-1' }) })
    );

    expect(html).toContain('data-can-export="true"');
    expect(mocks.getSatelliteAppSessionUser).toHaveBeenCalledWith('inventory');
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: { id: 'user-1' },
      wsId: 'ws-1',
    });
  });

  it('hides export access when the finance export permission is absent', async () => {
    mocks.getPermissions.mockResolvedValue(
      permissionsWith(['view_inventory_sales'])
    );
    const { default: InventorySalesPage } = await import('./page');
    const html = renderToStaticMarkup(
      await InventorySalesPage({ params: Promise.resolve({ wsId: 'ws-1' }) })
    );

    expect(html).toContain('data-can-export="false"');
  });
});
