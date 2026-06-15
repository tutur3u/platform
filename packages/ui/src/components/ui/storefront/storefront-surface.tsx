'use client';

import { ShoppingCart } from '@tuturuuu/icons';
import type {
  InventoryStorefront,
  InventoryStorefrontListing,
  InventoryStorefrontSection,
} from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { StorefrontCartSummary } from './cart-summary';
import { StorefrontEmptyListings } from './empty-listings';
import { StorefrontHeroPanel } from './hero-panel';
import { StorefrontImagePanel } from './image-panel';
import { StorefrontListingCard } from './listing-card';
import type {
  StorefrontCartLine,
  StorefrontSurfaceLabels,
  StorefrontSurfaceMode,
} from './types';
import { mergeStorefrontSurfaceLabels } from './types';
import {
  getAccentStyle,
  getSafeStorefrontHttpUrl,
  getStorefrontListingLimit,
  sanitizeStorefrontAccentColor,
  storefrontRadiusClasses,
  storefrontSurfaceClasses,
  storefrontThemeClasses,
} from './utils';

export function StorefrontSurface({
  cartLines = [],
  checkoutHref,
  className,
  compactLayout = false,
  emptyAction,
  headerActions,
  isDemo: _isDemo = false,
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
  compactLayout?: boolean;
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

  const cartSummary = (
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
  );

  return (
    <main
      className={cn(
        'min-h-dvh bg-background text-foreground',
        storefrontThemeClasses[storefront.themePreset],
        className
      )}
      style={getAccentStyle(accentColor)}
    >
      {/* Accent strip — makes the storefront's accent color immediately visible. */}
      <div
        className="h-1 w-full"
        style={{
          backgroundColor: 'var(--storefront-accent, var(--primary))',
        }}
      />
      {notice ? (
        <div className="border-border border-b bg-muted/35 px-4 py-2 text-center text-muted-foreground text-sm">
          {notice}
        </div>
      ) : null}

      <header className="border-border border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate font-semibold text-xl">
              {storefront.name}
            </h1>
            {storefront.description ? (
              <p className="mt-0.5 line-clamp-1 text-muted-foreground text-sm">
                {storefront.description}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {headerActions}
            <span
              className={cn(
                'inline-flex h-9 min-w-12 items-center justify-center gap-2 border bg-card px-3 font-medium text-sm',
                radius
              )}
              style={
                cartQuantity > 0
                  ? {
                      borderColor: 'var(--storefront-accent, var(--primary))',
                      color: 'var(--storefront-accent, var(--primary))',
                    }
                  : undefined
              }
            >
              <ShoppingCart className="h-4 w-4" />
              {cartQuantity}
            </span>
          </div>
        </div>
      </header>

      {isCheckout ? (
        <section className="mx-auto w-full max-w-xl px-4 py-8">
          {cartSummary}
        </section>
      ) : (
        <section
          className={cn(
            'mx-auto grid max-w-7xl gap-4 px-4 py-5',
            compactLayout ? 'grid-cols-1' : 'lg:grid-cols-[minmax(0,1fr)_340px]'
          )}
        >
          <div className="min-w-0">
            <StorefrontHeroPanel
              currency={currency}
              labels={labels}
              listingsCount={listings.length}
              radius={radius}
              storefront={storefront}
            />

            <StorefrontMerchSections
              radius={radius}
              sections={storefront.sections ?? []}
            />

            <div
              className={cn(
                'mt-4',
                compactLayout || storefront.layoutStyle === 'list'
                  ? 'grid gap-3'
                  : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3',
                !compactLayout &&
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

          {cartSummary}
        </section>
      )}
    </main>
  );
}

function StorefrontMerchSections({
  radius,
  sections,
}: {
  radius: string;
  sections: InventoryStorefrontSection[];
}) {
  const visibleSections = sections
    .filter((section) => section.status === 'published')
    .filter((section) => section.sectionType !== 'cover')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (visibleSections.length === 0) return null;

  return (
    <div className="mt-4 grid gap-3">
      {visibleSections.map((section) => {
        const sectionHref = getSafeStorefrontHttpUrl(section.href);

        return (
          <section
            className={cn(
              'grid overflow-hidden border border-border bg-card md:grid-cols-[minmax(0,1fr)_280px]',
              radius
            )}
            key={section.id}
          >
            <div className="flex min-w-0 flex-col justify-center gap-2 p-4">
              {section.title ? (
                <h2 className="font-semibold text-lg">{section.title}</h2>
              ) : null}
              {section.description ? (
                <p className="text-muted-foreground text-sm leading-6">
                  {section.description}
                </p>
              ) : null}
              {sectionHref ? (
                <a
                  className="mt-1 w-fit font-medium text-sm underline-offset-4 hover:underline"
                  href={sectionHref}
                >
                  {sectionHref.replace(/^https?:\/\//u, '')}
                </a>
              ) : null}
            </div>
            <StorefrontImagePanel
              className="min-h-36 md:min-h-full"
              imageUrl={section.imageUrl}
              label={section.title ?? 'Storefront section'}
            />
          </section>
        );
      })}
    </div>
  );
}
