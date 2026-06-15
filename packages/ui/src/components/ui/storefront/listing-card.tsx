'use client';

import { Minus, Plus } from '@tuturuuu/icons';
import type { InventoryStorefrontListing } from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import { Badge } from '../badge';
import { Button } from '../button';
import { AccentButton } from './accent-button';
import { StorefrontImagePanel } from './image-panel';
import type { StorefrontSurfaceLabels } from './types';
import { formatStorefrontPrice, getStorefrontListingLimit } from './utils';

export function StorefrontListingCard({
  currency,
  isList,
  labels,
  listing,
  onDecrement,
  onIncrement,
  quantity,
  radius,
  showInventoryBadges,
  surfaceClassName,
}: {
  currency: string;
  isList: boolean;
  labels: StorefrontSurfaceLabels;
  listing: InventoryStorefrontListing;
  onDecrement?: (listingId: string) => void;
  onIncrement?: (listingId: string, maxQuantity: number) => void;
  quantity: number;
  radius: string;
  showInventoryBadges: boolean;
  surfaceClassName: string;
}) {
  const limit = getStorefrontListingLimit(listing);
  const disabled = limit === 0 || quantity >= limit;
  const canChange = Boolean(onIncrement || onDecrement);

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
        <StorefrontImagePanel
          className={cn(
            'overflow-hidden transition duration-300 group-hover:scale-[1.02]',
            radius,
            isList ? 'aspect-square' : 'aspect-[4/3]'
          )}
          imageUrl={listing.imageUrl}
          label={listing.title}
        />
        {limit === 0 ? (
          <span className="absolute inset-x-2 top-2 inline-flex w-fit items-center rounded-full bg-foreground/85 px-2.5 py-0.5 font-medium text-background text-xs">
            {labels.soldOut}
          </span>
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 truncate font-semibold">{listing.title}</p>
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
        <div>
          <p className="font-semibold">
            {formatStorefrontPrice(listing.price, currency)}
          </p>
          {listing.compareAtPrice ? (
            <p className="text-muted-foreground text-xs line-through">
              {formatStorefrontPrice(listing.compareAtPrice, currency)}
            </p>
          ) : null}
        </div>
        {canChange ? (
          quantity > 0 ? (
            <div className="flex items-center gap-1">
              <Button
                aria-label={`${labels.quantity} -`}
                className={cn('h-8 w-8 p-0', radius)}
                onClick={() => onDecrement?.(listing.id)}
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
                onClick={() => onIncrement?.(listing.id, limit)}
                type="button"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <AccentButton
              disabled={disabled}
              onClick={() => onIncrement?.(listing.id, limit)}
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
