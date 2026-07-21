'use client';

import { ArrowLeft } from '@tuturuuu/icons';
import type {
  InventoryBundle,
  InventoryStorefront,
  InventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../dialog';
import { StorefrontBrowsePanel } from './browse-panel';
import { StorefrontBundleSelectionDialog } from './bundle-selection-dialog';
import { StorefrontCartPopover } from './cart-popover';
import { StorefrontCartSummary } from './cart-summary';
import { StorefrontCheckoutOverlay } from './checkout-overlay';
import { StorefrontEmptyListings } from './empty-listings';
import { StorefrontHeroPanel } from './hero-panel';
import { StorefrontListingCard } from './listing-card';
import { StorefrontMerchSections } from './merch-sections';
import { StorefrontProductDetail } from './product-detail';
import { StorefrontProductDialog } from './product-dialog';
import type {
  StorefrontBuyerDefaults,
  StorefrontCartLine,
  StorefrontLinkComponent,
  StorefrontSurfaceLabels,
  StorefrontSurfaceMode,
} from './types';
import { mergeStorefrontSurfaceLabels } from './types';
import {
  getAccentStyle,
  getStorefrontCartLineSubtotal,
  getStorefrontListingLimit,
  getStorefrontVariantLimit,
  sanitizeStorefrontAccentColor,
  storefrontRadiusClasses,
  storefrontSurfaceClasses,
  storefrontThemeClasses,
} from './utils';

export function StorefrontSurface({
  bundles = [],
  buyerDefaults,
  cartLines = [],
  cartHref,
  checkoutOpen,
  checkoutHref,
  className,
  compactLayout = false,
  detailListingId,
  emptyAction,
  headerActions,
  isDemo: _isDemo = false,
  isRedirecting = false,
  isSubmitting = false,
  linkComponent,
  labels: labelOverrides,
  listings,
  mode,
  notice,
  onBuyNow,
  onCheckoutOpen,
  onCheckoutOpenChange,
  onCheckoutSubmit,
  onDecrement,
  onDetailListingChange,
  onAddCartLine,
  onIncrement,
  onInstantCheckout,
  selectedListingId,
  storefront,
  storefrontHref,
  withinSharedShell = false,
}: {
  bundles?: InventoryBundle[];
  buyerDefaults?: StorefrontBuyerDefaults;
  cartLines?: StorefrontCartLine[];
  cartHref?: string;
  checkoutOpen?: boolean;
  checkoutHref?: string;
  className?: string;
  compactLayout?: boolean;
  detailListingId?: string | null;
  emptyAction?: ReactNode;
  headerActions?: ReactNode;
  isDemo?: boolean;
  isRedirecting?: boolean;
  isSubmitting?: boolean;
  linkComponent?: StorefrontLinkComponent;
  labels?: Partial<StorefrontSurfaceLabels>;
  listings: InventoryStorefrontListing[];
  mode: StorefrontSurfaceMode;
  notice?: ReactNode;
  onBuyNow?: (listingId: string, variantId?: string | null) => void;
  onCheckoutOpen?: () => void;
  onCheckoutOpenChange?: (open: boolean) => void;
  onCheckoutSubmit?: (formData: FormData) => void;
  onDecrement?: (listingId: string, variantId?: string | null) => void;
  onAddCartLine?: (line: StorefrontCartLine, maxQuantity?: number) => void;
  onDetailListingChange?: (listingId: string | null) => void;
  onIncrement?: (
    listingId: string,
    maxQuantity: number,
    variantId?: string | null
  ) => void;
  onInstantCheckout?: () => void;
  selectedListingId?: string;
  storefront: InventoryStorefront;
  storefrontHref?: string;
  withinSharedShell?: boolean;
}) {
  const labels = mergeStorefrontSurfaceLabels(labelOverrides);
  const NavigationLink = linkComponent ?? 'a';
  const [isCartPopoverOpen, setIsCartPopoverOpen] = useState(false);
  const [bundleSelectionListingId, setBundleSelectionListingId] = useState<
    string | null
  >(null);
  const accentColor = sanitizeStorefrontAccentColor(storefront.accentColor);
  const radius = storefrontRadiusClasses[storefront.cornerStyle];
  const resolveVariant = (
    listing: InventoryStorefrontListing,
    variantId?: string | null
  ) =>
    variantId
      ? (listing.variants ?? []).find((variant) => variant.id === variantId)
      : undefined;
  const cartEntries = cartLines.flatMap((line) => {
    const listing = listings.find((item) => item.id === line.listingId);
    if (!listing) return [];
    return [
      {
        bundle: listing.bundleId
          ? bundles.find((bundle) => bundle.id === listing.bundleId)
          : undefined,
        line,
        listing,
        variant: resolveVariant(listing, line.variantId),
      },
    ];
  });
  const lineLimit = (entry: (typeof cartEntries)[number]) =>
    entry.variant
      ? getStorefrontVariantLimit(entry.listing, entry.variant)
      : getStorefrontListingLimit(entry.listing);
  const checkoutEntries = cartEntries.filter(
    (entry) => Math.min(entry.line.quantity, lineLimit(entry)) > 0
  );
  const total = checkoutEntries.reduce((sum, entry) => {
    const quantity = Math.min(entry.line.quantity, lineLimit(entry));
    return (
      sum +
      getStorefrontCartLineSubtotal({
        bundle: entry.bundle,
        line: { ...entry.line, quantity },
        listing: entry.listing,
        variant: entry.variant,
      })
    );
  }, 0);
  const cartQuantity = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const detailListing = detailListingId
    ? listings.find((listing) => listing.id === detailListingId)
    : undefined;
  const selectedListing = selectedListingId
    ? listings.find((listing) => listing.id === selectedListingId)
    : undefined;
  const isProductDetail = mode === 'product' && Boolean(selectedListing);
  const visibleListings =
    mode === 'product' && selectedListingId
      ? listings.filter((listing) => listing.id === selectedListingId)
      : listings;
  const isCheckout = mode === 'checkout';
  const isCheckoutDialogOpen = checkoutOpen ?? isCheckout;
  const isPreview = mode === 'preview';
  const isCartPage = mode === 'cart';
  const bundleSelectionListing = bundleSelectionListingId
    ? listings.find((listing) => listing.id === bundleSelectionListingId)
    : null;
  const bundleSelectionBundle = bundleSelectionListing?.bundleId
    ? (bundles.find(
        (bundle) => bundle.id === bundleSelectionListing.bundleId
      ) ?? null)
    : null;
  const currency = storefront.currency ?? 'USD';
  const handleCheckoutOpen = () => {
    setIsCartPopoverOpen(false);
    onCheckoutOpen?.();
  };

  const cartSummary = (
    <StorefrontCartSummary
      buyerDefaults={buyerDefaults}
      cartEntries={checkoutEntries}
      checkoutHref={checkoutHref}
      currency={currency}
      isCheckout={false}
      isPreview={isPreview}
      isSubmitting={isSubmitting}
      labels={labels}
      linkComponent={linkComponent}
      onCheckoutOpen={handleCheckoutOpen}
      onCheckoutSubmit={onCheckoutSubmit}
      onInstantCheckout={mode === 'cart' ? onInstantCheckout : undefined}
      radius={radius}
      storefront={storefront}
      total={total}
      variant="panel"
    />
  );
  const cartPopoverSummary = (
    <StorefrontCartSummary
      buyerDefaults={buyerDefaults}
      cartEntries={checkoutEntries}
      checkoutHref={checkoutHref}
      currency={currency}
      isPreview={isPreview}
      isSubmitting={isSubmitting}
      labels={labels}
      linkComponent={linkComponent}
      onCheckoutOpen={handleCheckoutOpen}
      onCheckoutSubmit={onCheckoutSubmit}
      radius={radius}
      storefront={storefront}
      total={total}
      variant="popover"
    />
  );
  const checkoutDialogSummary = (
    <StorefrontCartSummary
      buyerDefaults={buyerDefaults}
      cartEntries={checkoutEntries}
      checkoutHref={checkoutHref}
      currency={currency}
      isCheckout
      isPreview={isPreview}
      isSubmitting={isSubmitting}
      labels={labels}
      linkComponent={linkComponent}
      onCheckoutSubmit={onCheckoutSubmit}
      radius={radius}
      storefront={storefront}
      total={total}
      variant="checkout"
    />
  );
  return (
    <main
      className={cn(
        withinSharedShell
          ? 'min-h-[calc(100dvh-4.3125rem)] bg-background text-foreground'
          : 'min-h-dvh bg-background text-foreground',
        storefrontThemeClasses[storefront.themePreset],
        className
      )}
      style={getAccentStyle(accentColor)}
    >
      {notice ? (
        <div className="border-border border-b bg-muted/35 px-4 py-2 text-center text-muted-foreground text-sm">
          {notice}
        </div>
      ) : null}

      {withinSharedShell ? null : (
        <header className="sticky top-0 z-30 border-border border-b bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 sm:px-6">
            <div className="min-w-0">
              <h1 className="truncate font-semibold text-base tracking-tight">
                {storefrontHref ? (
                  <NavigationLink
                    className="flex min-w-0 items-center gap-3 rounded-sm transition hover:text-[var(--storefront-accent-text,var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    href={storefrontHref}
                    title={storefront.name}
                  >
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-muted/35 font-mono text-xs uppercase"
                    >
                      {storefront.name.slice(0, 1)}
                    </span>
                    <span className="truncate">{storefront.name}</span>
                  </NavigationLink>
                ) : (
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-muted/35 font-mono text-xs uppercase"
                    >
                      {storefront.name.slice(0, 1)}
                    </span>
                    <span className="truncate">{storefront.name}</span>
                  </span>
                )}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {headerActions}
              <StorefrontCartPopover
                cartQuantity={cartQuantity}
                labels={labels}
                onOpenChange={setIsCartPopoverOpen}
                open={isCartPopoverOpen}
                radius={radius}
              >
                {cartPopoverSummary}
              </StorefrontCartPopover>
            </div>
          </div>
        </header>
      )}

      <section
        className={cn(
          'mx-auto max-w-7xl px-5 py-8 sm:px-6 sm:py-10',
          compactLayout ? 'max-w-5xl' : null
        )}
      >
        {isCartPage ? (
          <div className="mx-auto max-w-2xl">{cartSummary}</div>
        ) : (
          <div className="min-w-0">
            {isProductDetail && selectedListing ? (
              <>
                {storefrontHref ? (
                  <NavigationLink
                    className="mb-4 inline-flex items-center gap-1.5 text-muted-foreground text-sm transition hover:text-foreground"
                    href={storefrontHref}
                  >
                    <ArrowLeft aria-hidden className="size-4" />
                    {labels.browse}
                  </NavigationLink>
                ) : null}
                <StorefrontProductDetail
                  cartHref={cartHref}
                  cartLines={cartLines}
                  checkoutMode={storefront.checkoutMode}
                  currency={currency}
                  isSubmitting={isSubmitting}
                  labels={labels}
                  linkComponent={linkComponent}
                  listing={selectedListing}
                  onBuyNow={onBuyNow}
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

                <StorefrontBrowsePanel
                  compactLayout={compactLayout}
                  emptyListings={
                    <StorefrontEmptyListings
                      action={emptyAction}
                      labels={labels}
                      radius={radius}
                    />
                  }
                  flushTop={
                    !storefront.coverImageUrl &&
                    !storefront.heroImageUrl &&
                    (storefront.sections?.length ?? 0) === 0
                  }
                  labels={labels}
                  listings={visibleListings}
                  renderListing={(listing) => {
                    const listingBundle = listing.bundleId
                      ? bundles.find((bundle) => bundle.id === listing.bundleId)
                      : undefined;
                    const quantity = cartLines
                      .filter((item) => item.listingId === listing.id)
                      .reduce((sum, item) => sum + item.quantity, 0);

                    return (
                      <StorefrontListingCard
                        currency={currency}
                        isList={false}
                        key={listing.id}
                        labels={labels}
                        listing={listing}
                        onDecrement={onDecrement}
                        onConfigureBundle={
                          listingBundle?.categoryComponents.length
                            ? () => setBundleSelectionListingId(listing.id)
                            : undefined
                        }
                        onIncrement={onIncrement}
                        onOpenDetail={
                          onDetailListingChange
                            ? (id) => onDetailListingChange(id)
                            : undefined
                        }
                        quantity={quantity}
                        radius={radius}
                        showInventoryBadges={storefront.showInventoryBadges}
                        surfaceClassName={
                          storefrontSurfaceClasses[storefront.surfaceStyle]
                        }
                      />
                    );
                  }}
                />
              </>
            )}
          </div>
        )}
      </section>

      <StorefrontProductDialog
        cartHref={cartHref}
        cartLines={cartLines}
        checkoutMode={storefront.checkoutMode}
        currency={currency}
        isSubmitting={isSubmitting}
        labels={labels}
        linkComponent={linkComponent}
        listing={detailListing ?? null}
        onBuyNow={onBuyNow}
        onDecrement={onDecrement}
        onIncrement={onIncrement}
        onOpenChange={(open) => {
          if (!open) onDetailListingChange?.(null);
        }}
        radius={radius}
        showInventoryBadges={storefront.showInventoryBadges}
        surfaceClassName={storefrontSurfaceClasses[storefront.surfaceStyle]}
      />

      <StorefrontBundleSelectionDialog
        bundle={bundleSelectionBundle}
        currency={currency}
        labels={labels}
        listing={bundleSelectionListing ?? null}
        onAdd={(line) => {
          if (!bundleSelectionListing) return;
          onAddCartLine?.(
            line,
            getStorefrontListingLimit(bundleSelectionListing)
          );
        }}
        onOpenChange={(open) => {
          if (!open) setBundleSelectionListingId(null);
        }}
        open={Boolean(bundleSelectionListing && bundleSelectionBundle)}
        radius={radius}
      />

      <Dialog
        onOpenChange={(open) => onCheckoutOpenChange?.(open)}
        open={isCheckoutDialogOpen}
      >
        <DialogContent className="grid max-h-[92dvh] max-w-[min(42rem,calc(100vw-1rem))] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border-border p-0 shadow-sm sm:rounded-xl">
          <DialogHeader className="px-5 pt-5 pb-2 text-left sm:px-6">
            <DialogTitle>{labels.checkout}</DialogTitle>
            <DialogDescription>{labels.reservedCopy}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto px-5 pt-3 pb-5 sm:px-6">
            {checkoutDialogSummary}
          </div>
        </DialogContent>
      </Dialog>

      {isSubmitting || isRedirecting ? (
        <StorefrontCheckoutOverlay label={labels.redirectingToCheckout} />
      ) : null}
    </main>
  );
}
