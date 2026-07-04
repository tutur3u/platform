'use client';

import { Minus, Plus, SlidersHorizontal } from '@tuturuuu/icons';
import type { InventoryStorefrontListing } from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import { Badge } from '../badge';
import { Button } from '../button';
import { AccentButton } from './accent-button';
import { StorefrontImagePanel } from './image-panel';
import type { StorefrontSurfaceLabels } from './types';
import {
  formatStorefrontPrice,
  getStorefrontListingFromPrice,
  getStorefrontListingLimit,
  listingHasVariants,
} from './utils';

export function StorefrontListingCard({
  currency,
  isList,
  labels,
  listing,
  onDecrement,
  onConfigureBundle,
  onIncrement,
  onOpenDetail,
  quantity,
  radius,
  showInventoryBadges,
  surfaceClassName,
}: {
  currency: string;
  isList: boolean;
  labels: StorefrontSurfaceLabels;
  listing: InventoryStorefrontListing;
  onDecrement?: (listingId: string, variantId?: string | null) => void;
  onConfigureBundle?: () => void;
  onIncrement?: (
    listingId: string,
    maxQuantity: number,
    variantId?: string | null
  ) => void;
  onOpenDetail?: (listingId: string) => void;
  quantity: number;
  radius: string;
  showInventoryBadges: boolean;
  surfaceClassName: string;
}) {
  const hasVariants = listingHasVariants(listing);
  const needsBundleConfiguration = Boolean(onConfigureBundle);
  const limit = getStorefrontListingLimit(listing);
  const disabled = limit === 0 || quantity >= limit;
  const canChange = Boolean(onIncrement || onDecrement);
  const fromPrice = getStorefrontListingFromPrice(listing);
  const openDetail = onOpenDetail ? () => onOpenDetail(listing.id) : undefined;

  return (
    <article
      className={cn(
        surfaceClassName,
        radius,
        'group relative overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-foreground/10 hover:shadow-md',
        isList
          ? 'grid gap-4 p-3 sm:grid-cols-[112px_minmax(0,1fr)_auto] sm:items-center'
          : 'flex min-h-full flex-col gap-4 p-3'
      )}
    >
      <div className="relative">
        <button
          aria-label={listing.title}
          className={cn(
            'block w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            radius
          )}
          disabled={!openDetail}
          onClick={openDetail}
          type="button"
        >
          <StorefrontImagePanel
            className={cn(
              'overflow-hidden transition duration-300 group-hover:scale-[1.02]',
              radius,
              isList ? 'aspect-square' : 'aspect-[4/3]'
            )}
            imageUrl={listing.imageUrl}
            label={listing.title}
          />
        </button>
        {limit === 0 ? (
          <span className="absolute inset-x-2 top-2 inline-flex w-fit items-center rounded-full bg-foreground/85 px-2.5 py-0.5 font-medium text-background text-xs">
            {labels.soldOut}
          </span>
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="min-w-0 truncate text-left font-semibold transition hover:text-[var(--storefront-accent-text,var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-default disabled:hover:text-foreground"
            disabled={!openDetail}
            onClick={openDetail}
            type="button"
          >
            {listing.title}
          </button>
          <Badge className="border-border bg-background" variant="outline">
            {listing.listingType === 'bundle' ? labels.bundle : labels.product}
          </Badge>
        </div>
        <p className="mt-1 line-clamp-2 text-muted-foreground text-sm leading-6">
          {listing.description ?? labels.fallbackDescription}
        </p>
        {showInventoryBadges ? (
          <p className="mt-2 text-muted-foreground text-xs">
            {limit === 0
              ? labels.soldOut
              : `${listing.availableQuantity ?? labels.available} ${
                  typeof listing.availableQuantity === 'number'
                    ? labels.available
                    : ''
                }`.trim()}
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {hasVariants ? (
            <p className="truncate font-semibold tabular-nums">
              <span className="font-normal text-muted-foreground text-xs">
                {labels.fromPrice}{' '}
              </span>
              {formatStorefrontPrice(fromPrice, currency)}
            </p>
          ) : (
            <p className="truncate font-semibold tabular-nums">
              {formatStorefrontPrice(listing.price, currency)}
            </p>
          )}
          {!hasVariants && listing.compareAtPrice ? (
            <p className="truncate text-muted-foreground text-xs line-through">
              {formatStorefrontPrice(listing.compareAtPrice, currency)}
            </p>
          ) : null}
        </div>
        {hasVariants || needsBundleConfiguration ? (
          <AccentButton
            disabled={limit === 0 || (!openDetail && !onConfigureBundle)}
            onClick={needsBundleConfiguration ? onConfigureBundle : openDetail}
            radius={radius}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {limit === 0 ? labels.soldOut : labels.selectOptions}
          </AccentButton>
        ) : canChange ? (
          quantity > 0 ? (
            <div className="flex items-center gap-1">
              <Button
                aria-label={`${labels.quantity} -`}
                className={cn('h-8 w-8 p-0', radius)}
                onClick={() => onDecrement?.(listing.id, null)}
                type="button"
                variant="outline"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="min-w-8 text-center font-medium text-sm">
                {quantity}
              </span>
              <Button
                aria-label={`${labels.quantity} +`}
                className={cn('h-8 w-8 p-0', radius)}
                disabled={disabled}
                onClick={() => onIncrement?.(listing.id, limit, null)}
                type="button"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <AccentButton
              disabled={disabled}
              onClick={() => onIncrement?.(listing.id, limit, null)}
              radius={radius}
            >
              <Plus className="h-4 w-4" />
              {limit === 0 ? labels.soldOut : labels.add}
            </AccentButton>
          )
        ) : null}
      </div>
    </article>
  );
}
