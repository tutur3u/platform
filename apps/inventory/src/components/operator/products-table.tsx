'use client';

import {
  Calculator,
  CheckCircle2,
  ImageOff,
  Pencil,
  Tags,
  TriangleAlert,
  User,
} from '@tuturuuu/icons';
import type {
  InventoryCostProfile,
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  OperationsTable,
  type OperationsTableColumn,
} from './operations-table';
import { currency } from './operator-format';
import { EmptyRow, InfiniteListFooter } from './operator-shell';
import {
  getInventoryStockState,
  numberOrZero,
  stockAmountFromRecords,
} from './operator-stock';
import {
  type ProductBulkSelection,
  ProductBulkToolbar,
} from './product-bulk-actions';
import { ProductEditDialog } from './product-row-actions';
import {
  type ProductBadge,
  ProductBadges,
  ProductIdentity,
  stringField,
  TextStack,
} from './product-table-cells';
import { useWorkspaceCurrency } from './workspace-currency';

type OperatorTranslator = (
  key: string,
  values?: Record<string, unknown>
) => string;

type ProductTableRow = {
  badges: ProductBadge[];
  id: string;
  inventory: Record<string, unknown>;
  inventoryIndex: number | null;
  isLowStock: boolean;
  product: InventoryProductSummary;
  stockState: ReturnType<typeof getInventoryStockState>;
};

export function ProductsTable({
  costingProfiles = [],
  formOptions,
  pagination,
  rows,
  view,
  wsId,
}: {
  costingProfiles?: InventoryCostProfile[];
  formOptions?: InventoryProductFormOptionsResponse;
  pagination?: {
    fetchNextPage: () => void;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    totalCount: number;
  };
  rows: InventoryProductSummary[];
  view: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator') as OperatorTranslator;
  const formsText = useTranslations(
    'inventory.operator.forms'
  ) as OperatorTranslator;
  const wsCurrency = useWorkspaceCurrency();
  const [editing, setEditing] = useState<InventoryProductSummary | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  if (rows.length === 0) {
    return (
      <div className="grid gap-3">
        <EmptyRow label={t('empty')} />
        {pagination?.hasNextPage ? (
          <InfiniteListFooter
            hasNextPage
            isFetchingNextPage={pagination.isFetchingNextPage}
            loadedCount={0}
            onLoadMore={pagination.fetchNextPage}
            totalCount={pagination.totalCount}
          />
        ) : null}
      </div>
    );
  }

  const tableRows =
    view === 'stock'
      ? rows.flatMap((product) => toStockTableRows(product, costingProfiles, t))
      : rows.map((product) => toProductTableRow(product, costingProfiles, t));
  const selectedRows = tableRows.filter((row) => selectedIds.has(row.id));
  const bulkSelections: ProductBulkSelection[] = selectedRows.map((row) => ({
    inventoryIndex: row.inventoryIndex,
    key: row.id,
    product: row.product,
  }));
  const columns = getProductTableColumns({
    currencyCode: wsCurrency,
    isSelected: (id) => selectedIds.has(id),
    onEdit: setEditing,
    onSelect: (id, selected) => {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (selected) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    t,
    view,
  });

  return (
    <div className="grid min-w-0 gap-3">
      <ProductBulkToolbar
        allSelected={
          tableRows.length > 0 && selectedRows.length === tableRows.length
        }
        formOptions={formOptions}
        onClear={() => setSelectedIds(new Set())}
        onSelectAll={(selected) =>
          setSelectedIds(
            selected ? new Set(tableRows.map((row) => row.id)) : new Set()
          )
        }
        selections={bulkSelections}
        totalCount={tableRows.length}
        view={view}
        wsId={wsId}
      />
      <OperationsTable
        ariaLabel={
          view === 'stock' ? t('views.stock.title') : t('views.catalog.title')
        }
        columns={columns}
        getRowClassName={(row) =>
          view === 'stock' && row.isLowStock ? 'bg-destructive/5' : undefined
        }
        getRowId={(row) => row.id}
        minWidth={view === 'stock' ? 'min-w-[860px]' : 'min-w-[920px]'}
        onRowActivate={(row) => setEditing(row.product)}
        rowActivateLabel={(row) => `${formsText('edit')}: ${row.product.name}`}
        rows={tableRows}
      />
      {pagination ? (
        <InfiniteListFooter
          hasNextPage={pagination.hasNextPage}
          isFetchingNextPage={pagination.isFetchingNextPage}
          loadedCount={rows.length}
          onLoadMore={pagination.fetchNextPage}
          totalCount={pagination.totalCount}
        />
      ) : null}
      {editing ? (
        <ProductEditDialog
          costingProfiles={costingProfiles}
          key={editing.id}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setEditing(null);
          }}
          open
          options={formOptions}
          row={editing}
          wsId={wsId}
        />
      ) : null}
    </div>
  );
}

function getProductTableColumns({
  currencyCode,
  isSelected,
  onEdit,
  onSelect,
  t,
  view,
}: {
  currencyCode: string;
  isSelected: (id: string) => boolean;
  onEdit: (product: InventoryProductSummary) => void;
  onSelect: (id: string, selected: boolean) => void;
  t: OperatorTranslator;
  view: string;
}): OperationsTableColumn<ProductTableRow>[] {
  const actionColumn: OperationsTableColumn<ProductTableRow> = {
    cellClassName: 'text-right',
    className: 'w-[8rem] text-right',
    header: t('columns.actions'),
    key: 'actions',
    render: ({ product }) => (
      <Button
        onClick={() => onEdit(product)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Pencil className="h-4 w-4" />
        {t('forms.edit')}
      </Button>
    ),
  };

  if (view === 'stock') {
    return [
      {
        className: 'w-[26rem]',
        header: t('columns.item'),
        key: 'item',
        render: (row) => (
          <SelectableProductIdentity
            onSelect={onSelect}
            row={row}
            selected={isSelected(row.id)}
            selectLabel={t('productBulk.selectRow')}
          />
        ),
        sortValue: ({ product }) => product.name,
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
        sortValue: ({ inventory, product }) =>
          [
            stringField(inventory, 'warehouse_name') ?? product.warehouse ?? '',
            stringField(inventory, 'unit_name') ?? product.unit ?? '',
          ].join(' '),
      },
      {
        className: 'w-[9rem]',
        header: t('columns.available'),
        key: 'available',
        render: (row) => <StockAmount row={row} />,
        sortValue: ({ stockState }) =>
          stockState.isUnlimited ? Number.POSITIVE_INFINITY : stockState.amount,
      },
      {
        className: 'w-[8rem]',
        header: t('columns.minimum'),
        key: 'minimum',
        render: ({ stockState }) => (
          <span className="font-medium">{stockState.minAmount}</span>
        ),
        sortValue: ({ stockState }) => stockState.minAmount,
      },
      {
        className: 'w-[10rem]',
        header: t('columns.unitPrice'),
        key: 'unit-price',
        render: ({ inventory }) => (
          <span className="font-medium">
            {currency(numberOrZero(inventory.price), currencyCode)}
          </span>
        ),
        sortValue: ({ inventory }) => numberOrZero(inventory.price),
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
      render: (row) => (
        <SelectableProductIdentity
          onSelect={onSelect}
          row={row}
          selected={isSelected(row.id)}
          selectLabel={t('productBulk.selectRow')}
        />
      ),
      sortValue: ({ product }) => product.name,
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
      sortValue: ({ product }) =>
        [product.category ?? '', product.manufacturer ?? ''].join(' '),
    },
    {
      className: 'w-[14rem]',
      header: t('columns.owner'),
      key: 'owner',
      render: ({ product }) => (
        <TextStack primary={product.owner?.name} secondary={product.usage} />
      ),
      sortValue: ({ product }) =>
        [product.owner?.name ?? '', product.usage ?? ''].join(' '),
    },
    {
      className: 'w-[10rem]',
      header: t('columns.unitPrice'),
      key: 'price',
      render: ({ inventory }) => (
        <span className="font-medium">
          {currency(numberOrZero(inventory.price), currencyCode)}
        </span>
      ),
      sortValue: ({ inventory }) => numberOrZero(inventory.price),
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
      sortValue: ({ badges }) =>
        badges.filter(
          (badge) => badge.key !== 'costing' && badge.tone === 'missing'
        ).length,
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
      sortValue: ({ badges }) =>
        badges.some(
          (badge) => badge.key === 'costing' && badge.tone === 'ready'
        )
          ? 1
          : 0,
    },
    actionColumn,
  ];
}

function toProductTableRow(
  product: InventoryProductSummary,
  costingProfiles: InventoryCostProfile[],
  t: OperatorTranslator,
  options?: {
    inventory?: Record<string, unknown>;
    inventoryIndex?: number | null;
    rowId?: string;
    stock?: Record<string, unknown>;
  }
): ProductTableRow {
  const inventory = options?.inventory ?? product.inventory?.[0] ?? {};
  const amount = stockAmountFromRecords(
    inventory,
    options?.stock ?? product.stock?.[0]
  );
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
    id: options?.rowId ?? product.id,
    inventory,
    inventoryIndex: options?.inventoryIndex ?? null,
    isLowStock,
    product,
    stockState,
  };
}

function toStockTableRows(
  product: InventoryProductSummary,
  costingProfiles: InventoryCostProfile[],
  t: OperatorTranslator
) {
  const inventoryRows = product.inventory?.length ? product.inventory : [{}];

  return inventoryRows.map((inventory, index) =>
    toProductTableRow(product, costingProfiles, t, {
      inventory,
      inventoryIndex: product.inventory?.length ? index : null,
      rowId: [
        product.id,
        stringField(inventory, 'warehouse_id') ?? 'missing-warehouse',
        stringField(inventory, 'unit_id') ?? 'missing-unit',
        index,
      ].join(':'),
      stock: product.stock?.[index],
    })
  );
}

function SelectableProductIdentity({
  onSelect,
  row,
  selected,
  selectLabel,
}: {
  onSelect: (id: string, selected: boolean) => void;
  row: ProductTableRow;
  selected: boolean;
  selectLabel: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Checkbox
        aria-label={`${selectLabel}: ${row.product.name}`}
        checked={selected}
        onCheckedChange={(checked) => onSelect(row.id, Boolean(checked))}
      />
      <div className="min-w-0 flex-1">
        <ProductIdentity product={row.product} />
      </div>
    </div>
  );
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
