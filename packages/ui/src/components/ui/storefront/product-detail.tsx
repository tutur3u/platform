'use client';

import { ArrowRight, Minus, Plus, ShoppingCart, Zap } from '@tuturuuu/icons';
import type {
  InventoryListingVariant,
  InventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import { useMemo, useState } from 'react';
import { Badge } from '../badge';
import { Button } from '../button';
import { AccentButton } from './accent-button';
import { StorefrontImagePanel } from './image-panel';
import type { StorefrontCartLine, StorefrontSurfaceLabels } from './types';
import {
  formatStorefrontPrice,
  getStorefrontLinePrice,
  getStorefrontListingLimit,
  getStorefrontListingVariants,
  getStorefrontVariantLimit,
  storefrontCartLineKey,
} from './utils';

/**
 * Full-bleed product page: a large image alongside a details rail with price,
 * savings, availability, description, option/variant selectors, and the
 * quantity / add-to-cart / buy-now controls. Shared by both the dedicated
 * product route and the product detail dialog.
 */
export function StorefrontProductDetail({
  cartHref,
  cartLines,
  currency,
  isSubmitting = false,
  labels,
  listing,
  onBuyNow,
  onDecrement,
  onIncrement,
  quantity,
  radius,
  showInventoryBadges,
  surfaceClassName,
}: {
  cartHref?: string;
  cartLines?: StorefrontCartLine[];
  currency: string;
  isSubmitting?: boolean;
  labels: StorefrontSurfaceLabels;
  listing: InventoryStorefrontListing;
  onBuyNow?: (listingId: string, variantId?: string | null) => void;
  onDecrement?: (listingId: string, variantId?: string | null) => void;
  onIncrement?: (
    listingId: string,
    maxQuantity: number,
    variantId?: string | null
  ) => void;
  quantity: number;
  radius: string;
  showInventoryBadges: boolean;
  surfaceClassName: string;
}) {
  const options = listing.options ?? [];
  const variants = useMemo(
    () => getStorefrontListingVariants(listing),
    [listing]
  );
  const hasVariants = variants.length > 0;

  // Track the selected value per option group (groupId -> valueId).
  const [selected, setSelected] = useState<Record<string, string>>({});

  const selectedVariant: InventoryListingVariant | undefined = useMemo(() => {
    if (!hasVariants || options.length === 0) return undefined;
    return variants.find((variant) =>
      options.every((group) => {
        const optionValue = variant.optionValues.find(
          (value) => value.groupId === group.id
        );
        return optionValue && selected[group.id] === optionValue.valueId;
      })
    );
  }, [hasVariants, options, selected, variants]);

  const needsSelection = hasVariants && !selectedVariant;
  const limit = selectedVariant
    ? getStorefrontVariantLimit(listing, selectedVariant)
    : getStorefrontListingLimit(listing);
  const displayPrice = getStorefrontLinePrice(listing, selectedVariant);
  const compareAtPrice = selectedVariant
    ? selectedVariant.compareAtPrice
    : listing.compareAtPrice;
  const imageUrl = selectedVariant?.imageUrl ?? listing.imageUrl;
  const availableQuantity = selectedVariant
    ? selectedVariant.availableQuantity
    : listing.availableQuantity;

  const cartQuantity = useMemo(() => {
    if (!cartLines) return quantity;
    const key = storefrontCartLineKey(listing.id, selectedVariant?.id);
    return (
      cartLines.find(
        (line) => storefrontCartLineKey(line.listingId, line.variantId) === key
      )?.quantity ?? 0
    );
  }, [cartLines, listing.id, quantity, selectedVariant?.id]);

  const canChange = Boolean(onIncrement || onDecrement);
  const variantId = selectedVariant?.id ?? null;
  const soldOut = limit === 0;
  const addDisabled = needsSelection || soldOut || cartQuantity >= limit;
  const buyNowDisabled = needsSelection || soldOut || isSubmitting;
  const savingsPercent =
    compareAtPrice && compareAtPrice > displayPrice
      ? Math.round((1 - displayPrice / compareAtPrice) * 100)
      : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className={cn('overflow-hidden', surfaceClassName, radius)}>
        <StorefrontImagePanel
          className="aspect-square"
          imageUrl={imageUrl}
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

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {needsSelection ? (
            <span className="text-muted-foreground text-sm">
              {labels.fromPrice}{' '}
              <span className="font-semibold text-foreground text-xl tabular-nums">
                {formatStorefrontPrice(displayPrice, currency)}
              </span>
            </span>
          ) : (
            <>
              <span className="font-semibold text-2xl tabular-nums">
                {formatStorefrontPrice(displayPrice, currency)}
              </span>
              {compareAtPrice ? (
                <span className="text-lg text-muted-foreground line-through tabular-nums">
                  {formatStorefrontPrice(compareAtPrice, currency)}
                </span>
              ) : null}
            </>
          )}
        </div>

        {options.length > 0 ? (
          <div className="grid gap-4">
            {options.map((group) => (
              <div className="grid gap-2" key={group.id}>
                <span className="font-medium text-sm">{group.name}</span>
                <div className="flex flex-wrap gap-2">
                  {group.values.map((value) => {
                    const isActive = selected[group.id] === value.id;
                    return (
                      <button
                        aria-pressed={isActive}
                        className={cn(
                          'inline-flex h-10 items-center justify-center border px-3 font-medium text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                          radius,
                          isActive
                            ? 'border-[var(--storefront-accent,var(--primary))] bg-[var(--storefront-accent,var(--primary))]/10 text-[var(--storefront-accent,var(--primary))]'
                            : 'border-border bg-card hover:bg-muted/45'
                        )}
                        key={value.id}
                        onClick={() =>
                          setSelected((current) => ({
                            ...current,
                            [group.id]: value.id,
                          }))
                        }
                        type="button"
                      >
                        {value.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {showInventoryBadges && !needsSelection ? (
          <p className="text-muted-foreground text-sm">
            {soldOut
              ? labels.soldOut
              : typeof availableQuantity === 'number'
                ? `${availableQuantity} ${labels.available}`
                : labels.available}
          </p>
        ) : null}

        <p className="text-pretty text-muted-foreground leading-7">
          {listing.description ?? labels.fallbackDescription}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-3 border-border border-t pt-5">
          {canChange ? (
            needsSelection ? (
              <Button className={cn('h-11', radius)} disabled type="button">
                {labels.selectOptions}
              </Button>
            ) : cartQuantity > 0 ? (
              <div className="flex items-center gap-1">
                <Button
                  aria-label={`${labels.quantity} -`}
                  className={cn('h-11 w-11 p-0', radius)}
                  onClick={() => onDecrement?.(listing.id, variantId)}
                  type="button"
                  variant="outline"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="min-w-10 text-center font-semibold tabular-nums">
                  {cartQuantity}
                </span>
                <Button
                  aria-label={`${labels.quantity} +`}
                  className={cn('h-11 w-11 p-0', radius)}
                  disabled={addDisabled}
                  onClick={() => onIncrement?.(listing.id, limit, variantId)}
                  type="button"
                  variant="outline"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <AccentButton
                disabled={addDisabled}
                onClick={() => onIncrement?.(listing.id, limit, variantId)}
                radius={radius}
              >
                <Plus className="h-4 w-4" />
                {soldOut ? labels.soldOut : labels.add}
              </AccentButton>
            )
          ) : null}

          {onBuyNow ? (
            <Button
              className={cn('h-11', radius)}
              disabled={buyNowDisabled}
              onClick={() => onBuyNow(listing.id, variantId)}
              type="button"
            >
              <Zap className="size-4 shrink-0" />
              {labels.buyNow}
            </Button>
          ) : null}

          {cartHref && cartQuantity > 0 ? (
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
