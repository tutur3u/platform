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
    canMergeSeasons,
  }: {
    canExportSales?: boolean;
    canMergeSeasons?: boolean;
  }) => (
    <div
      data-can-export={String(Boolean(canExportSales))}
      data-can-merge={String(Boolean(canMergeSeasons))}
    />
  ),
}));

function permissionsWith(granted: string[]) {
  return {
    containsPermission: vi.fn(
      (permission: string) =>
        granted.includes('admin') || granted.includes(permission)
    ),
  };
}

describe('Inventory sales page', () => {
  it.each([
    [[], false],
    [['manage_inventory_catalog'], false],
    [['update_invoices', 'delete_invoices'], false],
    [['update_invoices', 'manage_inventory_catalog'], false],
    [['delete_invoices', 'update_inventory'], false],
    [['update_invoices', 'delete_invoices', 'manage_inventory_catalog'], true],
    [['update_invoices', 'delete_invoices', 'update_inventory'], true],
    [['admin'], true],
    [null, false],
  ])('passes authoritative merge access for %j', async (granted, expected) => {
    mocks.getPermissions.mockResolvedValue(
      granted ? permissionsWith(granted) : null
    );
    const { default: Page } = await import('./page');
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ wsId: 'ws-1' }) })
    );
    expect(html).toContain(`data-can-merge="${expected}"`);
  });
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
