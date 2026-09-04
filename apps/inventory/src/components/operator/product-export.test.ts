import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildProductExportRows,
  loadProductsForExport,
  serializeProductExportCsv,
} from './product-export';

const operatorDirectory = resolve(
  process.cwd(),
  'apps/inventory/src/components/operator'
);

describe('product export', () => {
  it('loads every server page and keeps owner and warehouse filters', async () => {
    const listProducts = vi
      .fn()
      .mockResolvedValueOnce({
        count: 3,
        data: [
          {
            id: 'product-1',
            inventory: [{ warehouse_id: 'warehouse-1' }],
            name: 'Keep',
            owner_id: 'owner-1',
          },
          {
            id: 'product-2',
            inventory: [{ warehouse_id: 'warehouse-2' }],
            name: 'Wrong warehouse',
            owner_id: 'owner-1',
          },
        ],
      })
      .mockResolvedValueOnce({
        count: 3,
        data: [
          {
            id: 'product-3',
            inventory: [{ warehouse_id: 'warehouse-1' }],
            name: 'Wrong owner',
            owner_id: 'owner-2',
          },
        ],
      });

    const products = await loadProductsForExport({
      filters: {
        productCategory: 'category-1',
        productOwner: 'owner-1',
        productSort: 'name-asc',
        productWarehouse: 'warehouse-1',
        q: 'tea',
        saleCategory: '',
        saleCreator: '',
        saleSort: 'date-desc',
        saleWarehouse: '',
        status: 'active',
      },
      listProducts,
      pageSize: 2,
      wsId: 'ws-1',
    });

    expect(products.map((product) => product.id)).toEqual(['product-1']);
    expect(listProducts).toHaveBeenNthCalledWith(1, 'ws-1', {
      categoryId: 'category-1',
      page: 1,
      pageSize: 2,
      q: 'tea',
      sortBy: 'name',
      sortOrder: 'asc',
      status: 'active',
    });
    expect(listProducts).toHaveBeenNthCalledWith(
      2,
      'ws-1',
      expect.objectContaining({ page: 2 })
    );
  });

  it('neutralizes spreadsheet formulas and preserves stock coordinates', () => {
    const rows = buildProductExportRows(
      [
        {
          archived: false,
          category: '=HYPERLINK("bad")',
          id: 'product-1',
          inventory: [
            {
              amount: 12,
              price: 1500,
              unit_name: 'box',
              warehouse_name: 'Main',
            },
          ],
          name: '+Injected',
          owner: { name: 'Lan' },
          stock: [{ amount: 12 }],
        },
      ],
      {
        activeLabel: 'Active',
        archivedLabel: 'Archived',
        currency: 'USD',
        unlimitedLabel: 'Unlimited',
      }
    );

    expect(rows).toEqual([
      expect.objectContaining({
        category: '\'=HYPERLINK("bad")',
        name: "'+Injected",
        owner: 'Lan',
        status: 'Active',
        stock: 'Main: 12 box',
      }),
    ]);
    expect(serializeProductExportCsv(rows)).toContain(
      '"\'=HYPERLINK(""bad"")"'
    );
  });

  it('places the labeled export dropdown on stock and catalog product toolbars', () => {
    const catalog = readFileSync(
      resolve(operatorDirectory, 'catalog-workspace-panel.tsx'),
      'utf8'
    );
    const stock = readFileSync(
      resolve(operatorDirectory, 'stock-workspace-panel.tsx'),
      'utf8'
    );

    expect(catalog).toContain('<ProductExportDropdown');
    expect(stock).toContain('<ProductExportDropdown');
    expect(catalog).toContain('showLabel');
    expect(stock).toContain('showLabel');
  });
});
