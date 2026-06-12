'use client';

import { ShoppingCart } from '@tuturuuu/icons';
import type {
  InventoryStorefront,
  InventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { Badge } from '../badge';
import { StorefrontCartSummary } from './cart-summary';
import { StorefrontEmptyListings } from './empty-listings';
import { StorefrontHeroPanel } from './hero-panel';
import { StorefrontListingCard } from './listing-card';
import type {
  StorefrontCartLine,
  StorefrontSurfaceLabels,
  StorefrontSurfaceMode,
} from './types';
import { mergeStorefrontSurfaceLabels } from './types';
import {
  getAccentStyle,
  getStorefrontListingLimit,
  sanitizeStorefrontAccentColor,
  storefrontRadiusClasses,
  storefrontSurfaceClasses,
} from './utils';

export function StorefrontSurface({
  cartLines = [],
  checkoutHref,
  className,
  emptyAction,
  headerActions,
  isDemo = false,
  isSubmitting = false,
  labels: labelOverrides,
  listings,
  mode,
  notice,
  onCheckoutSubmit,
  onDecrement,
  onIncrement,
  selectedListingId,
  storefront,
}: {
  cartLines?: StorefrontCartLine[];
  checkoutHref?: string;
  className?: string;
  emptyAction?: ReactNode;
  headerActions?: ReactNode;
  isDemo?: boolean;
  isSubmitting?: boolean;
  labels?: Partial<StorefrontSurfaceLabels>;
  listings: InventoryStorefrontListing[];
  mode: StorefrontSurfaceMode;
  notice?: ReactNode;
  onCheckoutSubmit?: (formData: FormData) => void;
  onDecrement?: (listingId: string) => void;
  onIncrement?: (listingId: string, maxQuantity: number) => void;
  selectedListingId?: string;
  storefront: InventoryStorefront;
}) {
  const labels = mergeStorefrontSurfaceLabels(labelOverrides);
  const accentColor = sanitizeStorefrontAccentColor(storefront.accentColor);
  const radius = storefrontRadiusClasses[storefront.cornerStyle];
  const cartEntries = cartLines.flatMap((line) => {
    const listing = listings.find((item) => item.id === line.listingId);
    return listing ? [{ line, listing }] : [];
  });
  const checkoutEntries = cartEntries.filter(({ line, listing }) => {
    const quantity = Math.min(
      line.quantity,
      getStorefrontListingLimit(listing)
    );
    return quantity > 0;
  });
  const total = checkoutEntries.reduce((sum, { line, listing }) => {
    const quantity = Math.min(
      line.quantity,
      getStorefrontListingLimit(listing)
    );
    return sum + listing.price * quantity;
  }, 0);
  const cartQuantity = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const visibleListings =
    mode === 'product' && selectedListingId
      ? listings.filter((listing) => listing.id === selectedListingId)
      : listings;
  const isCheckout = mode === 'checkout';
  const isPreview = mode === 'preview';
  const showCartListings = mode === 'cart' || isCheckout;
  const listingRows = showCartListings
    ? cartEntries.map(({ listing }) => listing)
    : visibleListings;
  const currency = storefront.currency ?? 'USD';

  return (
    <main
      className={cn('min-h-dvh bg-background text-foreground', className)}
      style={getAccentStyle(accentColor)}
    >
      {notice ? (
        <div className="border-border border-b bg-muted/35 px-4 py-2 text-center text-muted-foreground text-sm">
          {notice}
        </div>
      ) : null}

      <header className="border-border border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
              <span>
                {storefront.visibility === 'private'
                  ? labels.privateStore
                  : labels.publicStore}
              </span>
              {isDemo ? (
                <Badge variant="secondary">{labels.demoBadge}</Badge>
              ) : null}
              {isPreview ? (
                <Badge
                  className="border-border bg-background"
                  variant="outline"
                >
                  {labels.previewBadge}
                </Badge>
              ) : null}
              {storefront.checkoutMode === 'simulated' ? (
                <Badge
                  className="border-border bg-background"
                  variant="outline"
                >
                  {labels.simulatedBadge}
                </Badge>
              ) : null}
              {storefront.checkoutMode === 'disabled' ? (
                <Badge
                  className="border-border bg-background"
                  variant="outline"
                >
                  {labels.checkoutDisabledBadge}
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-0.5 truncate font-semibold text-xl">
              {storefront.name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {headerActions}
            <span
              className={cn(
                'inline-flex h-9 min-w-12 items-center justify-center gap-2 border bg-card px-3 font-medium text-sm',
                radius
              )}
            >
              <ShoppingCart className="h-4 w-4" />
              {cartQuantity}
            </span>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <StorefrontHeroPanel
            currency={currency}
            labels={labels}
            listingsCount={listings.length}
            radius={radius}
            storefront={storefront}
          />

          <div
            className={cn(
              'mt-4',
              storefront.layoutStyle === 'list'
                ? 'grid gap-3'
                : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3',
              storefront.layoutStyle === 'feature' &&
                '[&>article:first-child]:sm:col-span-2'
            )}
          >
            {listingRows.length === 0 ? (
              <StorefrontEmptyListings
                action={emptyAction}
                labels={labels}
                radius={radius}
              />
            ) : (
              listingRows.map((listing) => {
                const line = cartLines.find(
                  (item) => item.listingId === listing.id
                );

                return (
                  <StorefrontListingCard
                    currency={currency}
                    isList={storefront.layoutStyle === 'list'}
                    key={listing.id}
                    labels={labels}
                    listing={listing}
                    onDecrement={onDecrement}
                    onIncrement={onIncrement}
                    quantity={line?.quantity ?? 0}
                    radius={radius}
                    showInventoryBadges={storefront.showInventoryBadges}
                    surfaceClassName={
                      storefrontSurfaceClasses[storefront.surfaceStyle]
                    }
                  />
                );
              })
            )}
          </div>
        </div>

        <StorefrontCartSummary
          cartEntries={checkoutEntries}
          checkoutHref={checkoutHref}
          currency={currency}
          isCheckout={isCheckout}
          isPreview={isPreview}
          isSubmitting={isSubmitting}
          labels={labels}
          onCheckoutSubmit={onCheckoutSubmit}
          radius={radius}
          storefront={storefront}
          total={total}
        />
      </section>
    </main>
  );
}
