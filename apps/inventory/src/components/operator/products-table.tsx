'use client';

import {
  Calculator,
  CheckCircle2,
  ImageOff,
  Tags,
  TriangleAlert,
  User,
} from '@tuturuuu/icons';
import type {
  InventoryCostProfile,
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  OperationsTable,
  type OperationsTableColumn,
} from './operations-table';
import { EmptyRow } from './operator-shell';
import {
  getInventoryStockState,
  stockAmountFromRecords,
} from './operator-stock';
import { ProductRowActions } from './product-management';
import {
  formatNumber,
  type ProductBadge,
  ProductBadges,
  ProductIdentity,
  stringField,
  TextStack,
} from './product-table-cells';

type OperatorTranslator = (
  key: string,
  values?: Record<string, unknown>
) => string;

type ProductTableRow = {
  badges: ProductBadge[];
  inventory: Record<string, unknown>;
  isLowStock: boolean;
  product: InventoryProductSummary;
  stockState: ReturnType<typeof getInventoryStockState>;
};

export function ProductsTable({
  costingProfiles = [],
  formOptions,
  rows,
  view,
  wsId,
}: {
  costingProfiles?: InventoryCostProfile[];
  formOptions?: InventoryProductFormOptionsResponse;
  rows: InventoryProductSummary[];
  view: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator') as OperatorTranslator;

  if (rows.length === 0) return <EmptyRow label={t('empty')} />;

  const tableRows = rows.map((product) =>
    toProductTableRow(product, costingProfiles, t)
  );
  const columns = getProductTableColumns({
    costingProfiles,
    formOptions,
    t,
    view,
    wsId,
  });

  return (
    <OperationsTable
      ariaLabel={
        view === 'stock' ? t('views.stock.title') : t('views.catalog.title')
      }
      columns={columns}
      getRowClassName={(row) =>
        view === 'stock' && row.isLowStock ? 'bg-destructive/5' : undefined
      }
      getRowId={(row) => row.product.id}
      minWidth={view === 'stock' ? 'min-w-[860px]' : 'min-w-[920px]'}
      rows={tableRows}
    />
  );
}

function getProductTableColumns({
  costingProfiles,
  formOptions,
  t,
  view,
  wsId,
}: {
  costingProfiles: InventoryCostProfile[];
  formOptions?: InventoryProductFormOptionsResponse;
  t: OperatorTranslator;
  view: string;
  wsId: string;
}): OperationsTableColumn<ProductTableRow>[] {
  const actionColumn: OperationsTableColumn<ProductTableRow> = {
    cellClassName: 'text-right',
    className: 'w-[8rem] text-right',
    header: t('columns.actions'),
    key: 'actions',
    render: ({ product }) => (
      <ProductRowActions
        costingProfiles={costingProfiles}
        options={formOptions}
        row={product}
        wsId={wsId}
      />
    ),
  };

  if (view === 'stock') {
    return [
      {
        className: 'w-[26rem]',
        header: t('columns.item'),
        key: 'item',
        render: ({ product }) => <ProductIdentity product={product} />,
      },
      {
        className: 'w-[13rem]',
        header: t('columns.location'),
        key: 'location',
        render: ({ inventory, product }) => (
          <TextStack
            primary={
              stringField(inventory, 'warehouse_name') ?? product.warehouse
            }
            secondary={stringField(inventory, 'unit_name') ?? product.unit}
          />
        ),
      },
      {
        className: 'w-[9rem]',
        header: t('columns.available'),
        key: 'available',
        render: (row) => <StockAmount row={row} />,
      },
      {
        className: 'w-[8rem]',
        header: t('columns.minimum'),
        key: 'minimum',
        render: ({ stockState }) => (
          <span className="font-medium">{stockState.minAmount}</span>
        ),
      },
      {
        className: 'w-[10rem]',
        header: t('columns.unitPrice'),
        key: 'unit-price',
        render: ({ inventory }) => (
          <span className="font-medium">{formatNumber(inventory.price)}</span>
        ),
      },
      {
        className: 'w-[12rem]',
        header: t('columns.status'),
        key: 'status',
        render: ({ badges }) => (
          <ProductBadges
            badges={badges.filter((badge) => badge.key === 'stock')}
          />
        ),
      },
      actionColumn,
    ];
  }

  return [
    {
      className: 'w-[28rem]',
      header: t('columns.item'),
      key: 'item',
      render: ({ product }) => <ProductIdentity product={product} />,
    },
    {
      className: 'w-[14rem]',
      header: t('columns.category'),
      key: 'category',
      render: ({ product }) => (
        <TextStack
          primary={product.category}
          secondary={product.manufacturer}
        />
      ),
    },
    {
      className: 'w-[14rem]',
      header: t('columns.owner'),
      key: 'owner',
      render: ({ product }) => (
        <TextStack primary={product.owner?.name} secondary={product.usage} />
      ),
    },
    {
      className: 'w-[18rem]',
      header: t('columns.readiness'),
      key: 'readiness',
      render: ({ badges }) => (
        <ProductBadges
          badges={badges.filter((badge) => badge.key !== 'costing')}
        />
      ),
    },
    {
      className: 'w-[12rem]',
      header: t('columns.coverage'),
      key: 'coverage',
      render: ({ badges }) => (
        <ProductBadges
          badges={badges.filter((badge) => badge.key === 'costing')}
        />
      ),
    },
    actionColumn,
  ];
}

function toProductTableRow(
  product: InventoryProductSummary,
  costingProfiles: InventoryCostProfile[],
  t: OperatorTranslator
): ProductTableRow {
  const inventory = product.inventory?.[0] ?? {};
  const amount = stockAmountFromRecords(inventory, product.stock?.[0]);
  const stockState = getInventoryStockState({
    amount,
    minAmount: inventory.min_amount ?? product.min_amount,
  });
  const hasCosting = hasCostingCoverage(product, costingProfiles);
  const isLowStock = stockState.isLowStock;

  return {
    badges: [
      {
        icon: product.avatar_url ? CheckCircle2 : ImageOff,
        key: 'image',
        label: product.avatar_url
          ? t('badges.imageReady')
          : t('badges.imageMissing'),
        tone: product.avatar_url ? 'ready' : 'missing',
      },
      {
        icon: isLowStock ? TriangleAlert : CheckCircle2,
        key: 'stock',
        label: stockState.isUnlimited
          ? t('badges.stockUnlimited')
          : isLowStock
            ? t('badges.lowStock')
            : t('badges.stockReady'),
        tone: isLowStock ? 'danger' : 'ready',
      },
      {
        icon: Tags,
        key: 'category',
        label: product.category
          ? t('badges.categoryReady')
          : t('badges.categoryMissing'),
        tone: product.category ? 'ready' : 'missing',
      },
      {
        icon: User,
        key: 'owner',
        label: product.owner?.name
          ? t('badges.ownerReady')
          : t('badges.ownerMissing'),
        tone: product.owner?.name ? 'ready' : 'missing',
      },
      {
        icon: Calculator,
        key: 'costing',
        label: hasCosting
          ? t('badges.costingReady')
          : t('badges.costingMissing'),
        tone: hasCosting ? 'ready' : 'missing',
      },
    ],
    inventory,
    isLowStock,
    product,
    stockState,
  };
}

function StockAmount({ row }: { row: ProductTableRow }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-semibold',
        row.isLowStock && 'text-destructive'
      )}
    >
      {row.isLowStock ? <TriangleAlert className="h-4 w-4" /> : null}
      {row.stockState.displayAmount}
    </span>
  );
}

function hasCostingCoverage(
  product: InventoryProductSummary,
  profiles: InventoryCostProfile[]
) {
  if (!profiles.length) return false;

  const productName = normalizeMatch(product.name);
  const categoryName = normalizeMatch(product.category ?? '');

  return profiles.some((profile) => {
    if (profile.productId && profile.productId === product.id) return true;
    if (profile.categoryId && profile.categoryId === product.category_id) {
      return true;
    }

    const profileProductName = normalizeMatch(profile.productName ?? '');
    const profileName = normalizeMatch(profile.name);
    const profileCategoryName = normalizeMatch(profile.categoryName ?? '');

    return (
      Boolean(productName) &&
      (profileProductName === productName ||
        profileName === productName ||
        (Boolean(categoryName) && profileCategoryName === categoryName))
    );
  });
}

function normalizeMatch(value: string) {
  return value.trim().toLocaleLowerCase();
}
