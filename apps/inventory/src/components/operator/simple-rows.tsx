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
import { EmptyRow } from './operator-shell';
import { StorefrontEditorDialog } from './storefront-editor-dialog';

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
  const t = useTranslations('inventory.operator');
  const actionText = useTranslations('inventory.operator.forms');
  if (rows.length === 0) {
    return (
      <EmptyRow
        description={t(`emptyDescriptions.${type}`)}
        label={t('empty')}
      />
    );
  }

  return (
    <div className="grid gap-2">
      {rows.map((row) => {
        const anyRow = row as Record<string, unknown>;
        const title = String(anyRow.name ?? anyRow.id);
        const value = String(anyRow.status ?? '');
        const availableQuantity = anyRow.availableQuantity;
        const availableDetail =
          availableQuantity === null
            ? t('rowDetails.availableUnlimited')
            : t('rowDetails.available', {
                count:
                  typeof availableQuantity === 'number' ? availableQuantity : 0,
              });
        const details =
          type === 'storefronts'
            ? [
                t('rowDetails.listings', {
                  count:
                    typeof anyRow.listingsCount === 'number'
                      ? anyRow.listingsCount
                      : 0,
                }),
                t('rowDetails.checkoutMode', {
                  mode: actionText(
                    `checkoutModes.${String(anyRow.checkoutMode ?? 'disabled')}`
                  ),
                }),
              ]
            : [
                actionText('componentCount', {
                  count: Array.isArray((row as InventoryBundle).components)
                    ? (row as InventoryBundle).components.length
                    : 0,
                }),
                availableQuantity === null
                  ? availableDetail
                  : t('rowDetails.available', {
                      count:
                        typeof availableQuantity === 'number'
                          ? availableQuantity
                          : 0,
                    }),
              ];

        return (
          <article
            className="grid gap-3 rounded-lg border border-border bg-card p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            key={String(anyRow.id)}
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{title}</p>
              <p className="truncate text-muted-foreground text-xs">
                {String(
                  anyRow.slug ??
                    anyRow.publicToken ??
                    anyRow.created_at ??
                    anyRow.id
                )}
              </p>
              <div className="mt-2 flex min-w-0 flex-wrap gap-1">
                {details.map((detail) => (
                  <span
                    className="inline-flex h-6 max-w-full items-center rounded-md border border-border bg-muted/35 px-2 text-muted-foreground text-xs"
                    key={detail}
                  >
                    <span className="truncate">{detail}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
              {value ? <StatusBadge value={value} /> : null}
              {wsId && type === 'storefronts' ? (
                <a
                  className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-2 font-medium text-xs"
                  href={`/${wsId}/storefront/preview/${String(anyRow.id)}`}
                >
                  <Eye className="h-4 w-4" />
                  {t('previewStore')}
                </a>
              ) : null}
              {type === 'storefronts' && 'slug' in anyRow ? (
                <a
                  className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-2 font-medium text-xs"
                  href={`${STOREFRONT_APP_URL}/store/${String(anyRow.slug)}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('openStore')}
                </a>
              ) : null}
              {wsId && type === 'storefronts' ? (
                <StorefrontEditorDialog
                  storefront={row as InventoryStorefront}
                  wsId={wsId}
                />
              ) : null}
              {wsId && type === 'bundles' ? (
                <BundleEditorDialog
                  bundle={row as InventoryBundle}
                  products={products}
                  wsId={wsId}
                />
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
