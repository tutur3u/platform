'use client';

import { ArrowLeft, ShoppingCart } from '@tuturuuu/icons';
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
import { StorefrontProductDetail } from './product-detail';
import type {
  StorefrontBuyerDefaults,
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
  buyerDefaults,
  cartLines = [],
  cartHref,
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
  storefrontHref,
}: {
  buyerDefaults?: StorefrontBuyerDefaults;
  cartLines?: StorefrontCartLine[];
  cartHref?: string;
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
  storefrontHref?: string;
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
  const selectedListing = selectedListingId
    ? listings.find((listing) => listing.id === selectedListingId)
    : undefined;
  const isProductDetail = mode === 'product' && Boolean(selectedListing);
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
      buyerDefaults={buyerDefaults}
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
  const cartControlClassName = cn(
    'inline-flex h-11 min-w-14 shrink-0 items-center justify-center gap-2 border bg-card px-3 font-semibold text-sm tabular-nums transition hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
    radius
  );
  const cartControlStyle =
    cartQuantity > 0
      ? {
          borderColor: 'var(--storefront-accent, var(--primary))',
          color: 'var(--storefront-accent, var(--primary))',
        }
      : undefined;
  const cartControlContent = (
    <>
      <ShoppingCart aria-hidden className="size-5 shrink-0" />
      <span className="sr-only">{labels.cart}: </span>
      <span className="min-w-4 text-center">{cartQuantity}</span>
    </>
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

      <header className="sticky top-0 z-30 border-border border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/65">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate font-semibold text-xl">
              {storefrontHref ? (
                <a
                  className="block truncate rounded-sm transition hover:text-[var(--storefront-accent,var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  href={storefrontHref}
                  title={storefront.name}
                >
                  {storefront.name}
                </a>
              ) : (
                storefront.name
              )}
            </h1>
            {storefront.description ? (
              <p className="mt-0.5 line-clamp-1 text-muted-foreground text-sm">
                {storefront.description}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {headerActions}
            {cartHref ? (
              <a
                aria-label={`${labels.cart}: ${cartQuantity}`}
                className={cartControlClassName}
                href={cartHref}
                style={cartControlStyle}
              >
                {cartControlContent}
              </a>
            ) : (
              <span className={cartControlClassName} style={cartControlStyle}>
                {cartControlContent}
              </span>
            )}
          </div>
        </div>
      </header>

      {isCheckout ? (
        <section className="mx-auto w-full max-w-xl px-4 py-8">
          {cartHref ? (
            <a
              className="mb-4 inline-flex items-center gap-1.5 text-muted-foreground text-sm transition hover:text-foreground"
              href={cartHref}
            >
              <ArrowLeft aria-hidden className="size-4" />
              {labels.cart}
            </a>
          ) : null}
          <h2 className="mb-4 font-semibold text-2xl tracking-tight">
            {labels.checkout}
          </h2>
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
            {isProductDetail && selectedListing ? (
              <>
                {storefrontHref ? (
                  <a
                    className="mb-4 inline-flex items-center gap-1.5 text-muted-foreground text-sm transition hover:text-foreground"
                    href={storefrontHref}
                  >
                    <ArrowLeft aria-hidden className="size-4" />
                    {labels.browse}
                  </a>
                ) : null}
                <StorefrontProductDetail
                  cartHref={cartHref}
                  currency={currency}
                  labels={labels}
                  listing={selectedListing}
                  onDecrement={onDecrement}
                  onIncrement={onIncrement}
                  quantity={
                    cartLines.find(
                      (item) => item.listingId === selectedListing.id
                    )?.quantity ?? 0
                  }
                  radius={radius}
                  showInventoryBadges={storefront.showInventoryBadges}
                  surfaceClassName={
                    storefrontSurfaceClasses[storefront.surfaceStyle]
                  }
                />
              </>
            ) : (
              <>
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
                    'mt-4 grid gap-4',
                    compactLayout
                      ? 'sm:grid-cols-2'
                      : 'sm:grid-cols-2 xl:grid-cols-3'
                  )}
                >
                  {listingRows.length === 0 ? (
                    showCartListings ? (
                      <div
                        className={cn(
                          'col-span-full grid min-h-56 place-items-center border border-dashed bg-muted/25 p-6 text-center',
                          radius
                        )}
                      >
                        <div className="max-w-sm">
                          <ShoppingCart
                            aria-hidden
                            className="mx-auto size-8 text-muted-foreground"
                          />
                          <p className="mt-3 font-semibold">
                            {labels.emptyCart}
                          </p>
                          {storefrontHref ? (
                            <a
                              className="mt-4 inline-flex items-center gap-1.5 font-medium text-[var(--storefront-accent,var(--primary))] text-sm hover:underline"
                              href={storefrontHref}
                            >
                              <ArrowLeft aria-hidden className="size-4" />
                              {labels.browse}
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <StorefrontEmptyListings
                        action={emptyAction}
                        labels={labels}
                        radius={radius}
                      />
                    )
                  ) : (
                    listingRows.map((listing) => {
                      const line = cartLines.find(
                        (item) => item.listingId === listing.id
                      );

                      return (
                        <StorefrontListingCard
                          currency={currency}
                          isList={false}
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
              </>
            )}
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
