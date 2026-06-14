'use client';

import { ExternalLink, Eye } from '@tuturuuu/icons';
import type {
  InventoryBundle,
  InventoryProductSummary,
  InventoryStorefront,
} from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';
import { STOREFRONT_APP_URL } from '@/constants/common';
import { BundleEditorDialog } from './bundle-editor-dialog';
import {
  OperationsTable,
  type OperationsTableColumn,
} from './operations-table';
import { EmptyRow } from './operator-shell';
import { formatNumber } from './product-table-cells';
import { StorefrontEditorDialog } from './storefront-editor-dialog';

type OperatorTranslator = (
  key: string,
  values?: Record<string, unknown>
) => string;

function StatusBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-border bg-primary/10 px-2 font-medium text-primary text-xs">
      {value}
    </span>
  );
}

export function SimpleRows({
  products = [],
  rows,
  type,
  wsId,
}: {
  products?: InventoryProductSummary[];
  rows: Array<InventoryBundle | InventoryStorefront>;
  type: 'bundles' | 'storefronts';
  wsId?: string;
}) {
  const t = useTranslations('inventory.operator') as OperatorTranslator;
  const actionText = useTranslations(
    'inventory.operator.forms'
  ) as OperatorTranslator;

  if (rows.length === 0) {
    return (
      <EmptyRow
        description={t(`emptyDescriptions.${type}`)}
        label={t('empty')}
      />
    );
  }

  if (type === 'storefronts') {
    const storefrontRows = rows as InventoryStorefront[];

    return (
      <OperationsTable
        ariaLabel={t('views.storefront.title')}
        columns={getStorefrontColumns({ actionText, t, wsId })}
        getRowId={(row) => row.id}
        minWidth="min-w-[980px]"
        rows={storefrontRows}
      />
    );
  }

  return (
    <OperationsTable
      ariaLabel={t('views.bundles.title')}
      columns={getBundleColumns({ actionText, products, t, wsId })}
      getRowId={(row) => row.id}
      minWidth="min-w-[900px]"
      rows={rows as InventoryBundle[]}
    />
  );
}

function getStorefrontColumns({
  actionText,
  t,
  wsId,
}: {
  actionText: OperatorTranslator;
  t: OperatorTranslator;
  wsId?: string;
}): OperationsTableColumn<InventoryStorefront>[] {
  return [
    {
      className: 'w-[24rem]',
      header: t('columns.item'),
      key: 'storefront',
      render: (row) => (
        <EntityIdentity
          imageUrl={row.heroImageUrl}
          subtitle={row.slug}
          title={row.name}
        />
      ),
    },
    {
      className: 'w-[9rem]',
      header: t('columns.status'),
      key: 'status',
      render: (row) => (
        <StatusBadge value={actionText(`storefrontStatus.${row.status}`)} />
      ),
    },
    {
      className: 'w-[9rem]',
      header: t('columns.visibility'),
      key: 'visibility',
      render: (row) => (
        <span className="font-medium">
          {actionText(
            row.visibility === 'public'
              ? 'visibilityPublic'
              : 'visibilityPrivate'
          )}
        </span>
      ),
    },
    {
      className: 'w-[10rem]',
      header: t('columns.listings'),
      key: 'listings',
      render: (row) =>
        t('rowDetails.listings', {
          count: row.listingsCount ?? 0,
        }),
    },
    {
      className: 'w-[11rem]',
      header: t('columns.checkout'),
      key: 'checkout',
      render: (row) => (
        <span className="font-medium">
          {actionText(`checkoutModes.${row.checkoutMode}`)}
        </span>
      ),
    },
    {
      className: 'w-[10rem]',
      header: t('columns.updated'),
      key: 'updated',
      render: (row) => (
        <span className="text-muted-foreground">
          {formatDate(row.updatedAt ?? row.createdAt)}
        </span>
      ),
    },
    {
      cellClassName: 'text-right',
      className: 'w-[16rem] text-right',
      header: t('columns.actions'),
      key: 'actions',
      render: (row) => <StorefrontActions row={row} t={t} wsId={wsId} />,
    },
  ];
}

function getBundleColumns({
  actionText,
  products,
  t,
  wsId,
}: {
  actionText: OperatorTranslator;
  products: InventoryProductSummary[];
  t: OperatorTranslator;
  wsId?: string;
}): OperationsTableColumn<InventoryBundle>[] {
  return [
    {
      className: 'w-[24rem]',
      header: t('columns.item'),
      key: 'bundle',
      render: (row) => (
        <EntityIdentity
          imageUrl={row.imageUrl}
          subtitle={row.slug}
          title={row.name}
        />
      ),
    },
    {
      className: 'w-[9rem]',
      header: t('columns.status'),
      key: 'status',
      render: (row) => (
        <StatusBadge value={actionText(`bundleStatus.${row.status}`)} />
      ),
    },
    {
      className: 'w-[10rem]',
      header: t('columns.components'),
      key: 'components',
      render: (row) =>
        actionText('componentCount', {
          count: row.components.length,
        }),
    },
    {
      className: 'w-[10rem]',
      header: t('columns.available'),
      key: 'available',
      render: (row) => formatAvailability(row.availableQuantity, t),
    },
    {
      className: 'w-[9rem]',
      header: t('columns.price'),
      key: 'price',
      render: (row) => (
        <span className="font-medium">{formatNumber(row.price)}</span>
      ),
    },
    {
      cellClassName: 'text-right',
      className: 'w-[10rem] text-right',
      header: t('columns.actions'),
      key: 'actions',
      render: (row) =>
        wsId ? (
          <BundleEditorDialog bundle={row} products={products} wsId={wsId} />
        ) : null,
    },
  ];
}

function EntityIdentity({
  imageUrl,
  subtitle,
  title,
}: {
  imageUrl?: null | string;
  subtitle?: null | string;
  title: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted/40">
        {imageUrl ? (
          // biome-ignore lint/performance/noImgElement: thumbnails use arbitrary signed workspace media URLs.
          <img
            alt={title}
            className="h-full w-full object-cover"
            src={imageUrl}
          />
        ) : (
          <span className="font-semibold text-muted-foreground text-xs">
            {title.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium">{title}</p>
        {subtitle ? (
          <p className="mt-1 truncate text-muted-foreground text-xs">
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function StorefrontActions({
  row,
  t,
  wsId,
}: {
  row: InventoryStorefront;
  t: OperatorTranslator;
  wsId?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
      {wsId ? (
        <a
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-2 font-medium text-xs"
          href={`/${wsId}/storefront/preview/${row.id}`}
        >
          <Eye className="h-4 w-4" />
          {t('previewStore')}
        </a>
      ) : null}
      {row.slug ? (
        <a
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-2 font-medium text-xs"
          href={`${STOREFRONT_APP_URL}/store/${row.slug}`}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink className="h-4 w-4" />
          {t('openStore')}
        </a>
      ) : null}
      {wsId ? <StorefrontEditorDialog storefront={row} wsId={wsId} /> : null}
    </div>
  );
}

function formatAvailability(
  value: InventoryBundle['availableQuantity'] | null,
  t: OperatorTranslator
) {
  if (value === null) return t('rowDetails.availableUnlimited');

  return t('rowDetails.available', {
    count: typeof value === 'number' ? value : 0,
  });
}

function formatDate(value?: null | string) {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
