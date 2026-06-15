'use client';

import { ArrowRight, Minus, Plus, ShoppingCart } from '@tuturuuu/icons';
import type { InventoryStorefrontListing } from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import { Badge } from '../badge';
import { Button } from '../button';
import { AccentButton } from './accent-button';
import { StorefrontImagePanel } from './image-panel';
import type { StorefrontSurfaceLabels } from './types';
import { formatStorefrontPrice, getStorefrontListingLimit } from './utils';

/**
 * Full-bleed product page: a large image alongside a details rail with price,
 * savings, availability, description, and the quantity / add-to-cart controls.
 * Replaces the previous behavior of rendering a single grid card for the
 * product route.
 */
export function StorefrontProductDetail({
  cartHref,
  currency,
  labels,
  listing,
  onDecrement,
  onIncrement,
  quantity,
  radius,
  showInventoryBadges,
  surfaceClassName,
}: {
  cartHref?: string;
  currency: string;
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
  const savingsPercent =
    listing.compareAtPrice && listing.compareAtPrice > listing.price
      ? Math.round((1 - listing.price / listing.compareAtPrice) * 100)
      : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className={cn('overflow-hidden', surfaceClassName, radius)}>
        <StorefrontImagePanel
          className="aspect-square"
          imageUrl={listing.imageUrl}
          label={listing.title}
          priority
        />
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-border bg-background" variant="outline">
            {listing.listingType === 'bundle' ? labels.bundle : labels.product}
          </Badge>
          {savingsPercent > 0 ? (
            <Badge
              className="border-transparent bg-[var(--storefront-accent,var(--primary))] text-[var(--storefront-accent-foreground,var(--primary-foreground))]"
              variant="outline"
            >
              -{savingsPercent}%
            </Badge>
          ) : null}
        </div>

        <h2 className="text-balance font-semibold text-3xl tracking-tight md:text-4xl">
          {listing.title}
        </h2>

        <div className="flex items-baseline gap-3">
          <span className="font-semibold text-2xl tabular-nums">
            {formatStorefrontPrice(listing.price, currency)}
          </span>
          {listing.compareAtPrice ? (
            <span className="text-lg text-muted-foreground tabular-nums line-through">
              {formatStorefrontPrice(listing.compareAtPrice, currency)}
            </span>
          ) : null}
        </div>

        {showInventoryBadges ? (
          <p className="text-muted-foreground text-sm">
            {limit === 0
              ? labels.soldOut
              : typeof listing.availableQuantity === 'number'
                ? `${listing.availableQuantity} ${labels.available}`
                : labels.available}
          </p>
        ) : null}

        <p className="text-pretty text-muted-foreground leading-7">
          {listing.description ?? labels.fallbackDescription}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-3 border-border border-t pt-5">
          {canChange ? (
            quantity > 0 ? (
              <div className="flex items-center gap-1">
                <Button
                  aria-label={`${labels.quantity} -`}
                  className={cn('h-11 w-11 p-0', radius)}
                  onClick={() => onDecrement?.(listing.id)}
                  type="button"
                  variant="outline"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="min-w-10 text-center font-semibold tabular-nums">
                  {quantity}
                </span>
                <Button
                  aria-label={`${labels.quantity} +`}
                  className={cn('h-11 w-11 p-0', radius)}
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

          {cartHref && quantity > 0 ? (
            <Button asChild className={cn('h-11', radius)} variant="outline">
              <a href={cartHref}>
                <ShoppingCart className="size-4 shrink-0" />
                {labels.cart}
                <ArrowRight className="size-4 shrink-0" />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
