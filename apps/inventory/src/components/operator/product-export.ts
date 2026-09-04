import type {
  InventoryCatalogListQuery,
  InventoryListResponse,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import { formatCurrency } from '@tuturuuu/utils/format';
import type { InventoryFilters } from './operator-types';
import { filterInventoryProducts } from './product-filters';

export type ProductExportRow = {
  category: string;
  description: string;
  manufacturer: string;
  name: string;
  owner: string;
  price: string;
  status: string;
  stock: string;
  usage: string;
};

type ProductExportOptions = {
  activeLabel: string;
  archivedLabel: string;
  currency: string;
  unlimitedLabel: string;
};

type ProductListLoader = (
  wsId: string,
  query: InventoryCatalogListQuery
) => Promise<InventoryListResponse<InventoryProductSummary>>;

export async function loadProductsForExport({
  filters,
  listProducts,
  pageSize = 100,
  wsId,
}: {
  filters: InventoryFilters;
  listProducts: ProductListLoader;
  pageSize?: number;
  wsId: string;
}) {
  const products: InventoryProductSummary[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (products.length < total) {
    const response = await listProducts(wsId, {
      categoryId: filters.productCategory || undefined,
      page,
      pageSize,
      q: filters.q || undefined,
      sortBy: filters.productSort.startsWith('name-') ? 'name' : 'created_at',
      sortOrder: filters.productSort.endsWith('-asc') ? 'asc' : 'desc',
      status:
        filters.status === 'active' || filters.status === 'archived'
          ? filters.status
          : undefined,
    });
    products.push(...response.data);
    total = response.count;
    if (response.data.length < pageSize) break;
    page += 1;
  }

  return filterInventoryProducts(products, {
    ownerId: filters.productOwner,
    warehouseId: filters.productWarehouse,
  });
}

export function neutralizeSpreadsheetFormula(value: string) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function text(value: unknown) {
  return neutralizeSpreadsheetFormula(
    typeof value === 'string' ? value : value == null ? '' : String(value)
  );
}

export function buildProductExportRows(
  products: InventoryProductSummary[],
  options: ProductExportOptions
): ProductExportRow[] {
  return products.map((product) => ({
    category: text(product.category),
    description: text(product.description),
    manufacturer: text(product.manufacturer),
    name: text(product.name),
    owner: text(product.owner?.name),
    price: text(getPriceSummary(product, options.currency)),
    status: product.archived ? options.archivedLabel : options.activeLabel,
    stock: text(getStockSummary(product, options.unlimitedLabel)),
    usage: text(product.usage),
  }));
}

function getStockSummary(
  product: InventoryProductSummary,
  unlimitedLabel: string
) {
  const inventory = product.inventory ?? [];
  if (inventory.length === 0) return '';

  return inventory
    .map((entry, index) => {
      const stock = product.stock?.[index];
      const warehouse = text(
        entry.warehouse_name ?? stock?.warehouse ?? product.warehouse ?? '-'
      );
      const unitValue = entry.unit_name ?? stock?.unit ?? product.unit;
      const unit = unitValue ? ` ${text(unitValue)}` : '';
      const amountValue = entry.amount ?? stock?.amount;
      const amount =
        amountValue === null ? unlimitedLabel : (amountValue ?? '-');
      return `${warehouse}: ${amount}${unit}`;
    })
    .join(' | ');
}

function getPriceSummary(product: InventoryProductSummary, currency: string) {
  const inventory = product.inventory ?? [];
  if (inventory.length === 0) return '';

  return inventory
    .map((entry, index) => {
      const stock = product.stock?.[index];
      const warehouse = text(
        entry.warehouse_name ?? stock?.warehouse ?? product.warehouse ?? '-'
      );
      const priceValue = entry.price ?? stock?.price;
      const price =
        typeof priceValue === 'number'
          ? formatCurrency(priceValue, currency)
          : '-';
      return `${warehouse}: ${price}`;
    })
    .join(' | ');
}

export function localizeProductExportRows(
  rows: ProductExportRow[],
  headers: Record<keyof ProductExportRow, string>
) {
  return rows.map((row) =>
    Object.fromEntries(
      (Object.keys(headers) as Array<keyof ProductExportRow>).map((key) => [
        headers[key],
        row[key],
      ])
    )
  );
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export function serializeProductExportCsv(
  rows: Array<Record<string, unknown>>
) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0] ?? {});
  return [
    headers.map(csvCell).join(','),
    ...rows.map((row) =>
      headers.map((header) => csvCell(row[header])).join(',')
    ),
  ].join('\n');
}
