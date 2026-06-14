'use client';

import type { CheckCircle2 } from '@tuturuuu/icons';
import type { InventoryProductSummary } from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import { numberOrZero } from './operator-stock';

type BadgeTone = 'danger' | 'missing' | 'ready';

export type ProductBadge = {
  icon: typeof CheckCircle2;
  key: string;
  label: string;
  tone: BadgeTone;
};

export function ProductIdentity({
  product,
}: {
  product: InventoryProductSummary;
}) {
  const subtitle = product.description || product.usage;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted/40">
        {product.avatar_url ? (
          // biome-ignore lint/performance/noImgElement: thumbnails use arbitrary signed workspace media URLs.
          <img
            alt={product.name}
            className="h-full w-full object-cover"
            src={product.avatar_url}
          />
        ) : (
          <span className="font-semibold text-muted-foreground text-xs">
            {product.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <span className="block truncate font-medium">{product.name}</span>
        {subtitle ? (
          <span className="mt-1 block truncate text-muted-foreground text-xs">
            {subtitle}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function ProductBadges({ badges }: { badges: ProductBadge[] }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {badges.map((badge) => {
        const Icon = badge.icon;

        return (
          <span
            className={cn(
              'inline-flex h-6 min-w-0 items-center gap-1 rounded-md border px-2 text-xs',
              badge.tone === 'ready' &&
                'border-primary/25 bg-primary/10 text-primary',
              badge.tone === 'missing' &&
                'border-border bg-muted text-muted-foreground',
              badge.tone === 'danger' &&
                'border-destructive/25 bg-destructive/10 text-destructive'
            )}
            key={badge.key}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-28 truncate">{badge.label}</span>
          </span>
        );
      })}
    </div>
  );
}

export function TextStack({
  primary,
  secondary,
}: {
  primary?: null | string;
  secondary?: null | string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{primary || '-'}</p>
      {secondary ? (
        <p className="mt-1 truncate text-muted-foreground text-xs">
          {secondary}
        </p>
      ) : null}
    </div>
  );
}

export function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === 'string' && value.trim() ? value : null;
}

export function formatNumber(value: unknown) {
  const amount = numberOrZero(value);

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}
