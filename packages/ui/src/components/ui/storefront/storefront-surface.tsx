'use client';

import { ArrowLeft } from '@tuturuuu/icons';
import type {
  InventoryBundle,
  InventoryStorefront,
  InventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useMemo, useState } from 'react';
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
  checkoutBlocked = false,
  checkoutFields,
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
  checkoutBlocked?: boolean;
  checkoutFields?: ReactNode;
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
  const listingsById = useMemo(
    () => new Map(listings.map((listing) => [listing.id, listing])),
    [listings]
  );
  const bundlesById = useMemo(
    () => new Map(bundles.map((bundle) => [bundle.id, bundle])),
    [bundles]
  );
  const cartEntries = useMemo(
    () =>
      cartLines.flatMap((line) => {
        const listing = listingsById.get(line.listingId);
        if (!listing) return [];
        return [
          {
            bundle: listing.bundleId
              ? bundlesById.get(listing.bundleId)
              : undefined,
            line,
            listing,
            variant: line.variantId
              ? (listing.variants ?? []).find(
                  (variant) => variant.id === line.variantId
                )
              : undefined,
          },
        ];
      }),
    [bundlesById, cartLines, listingsById]
  );
  const checkoutEntries = useMemo(
    () =>
      cartEntries.filter((entry) => {
        const limit = entry.variant
          ? getStorefrontVariantLimit(entry.listing, entry.variant)
          : getStorefrontListingLimit(entry.listing);
        return Math.min(entry.line.quantity, limit) > 0;
      }),
    [cartEntries]
  );
  const total = useMemo(
    () =>
      checkoutEntries.reduce((sum, entry) => {
        const limit = entry.variant
          ? getStorefrontVariantLimit(entry.listing, entry.variant)
          : getStorefrontListingLimit(entry.listing);
        const quantity = Math.min(entry.line.quantity, limit);
        return (
          sum +
          getStorefrontCartLineSubtotal({
            bundle: entry.bundle,
            line: { ...entry.line, quantity },
            listing: entry.listing,
            variant: entry.variant,
          })
        );
      }, 0),
    [checkoutEntries]
  );
  const cartQuantityByListing = useMemo(() => {
    const quantities = new Map<string, number>();

    for (const line of cartLines) {
      quantities.set(
        line.listingId,
        (quantities.get(line.listingId) ?? 0) + line.quantity
      );
    }

    return quantities;
  }, [cartLines]);
  const cartQuantity = useMemo(
    () => cartLines.reduce((sum, line) => sum + line.quantity, 0),
    [cartLines]
  );
  const detailListing = detailListingId
    ? listingsById.get(detailListingId)
    : undefined;
  const selectedListing = selectedListingId
    ? listingsById.get(selectedListingId)
    : undefined;
  const isProductDetail = mode === 'product' && Boolean(selectedListing);
  const visibleListings = useMemo(
    () =>
      mode === 'product' && selectedListing ? [selectedListing] : listings,
    [listings, mode, selectedListing]
  );
  const isCheckout = mode === 'checkout';
  const isCheckoutDialogOpen = checkoutOpen ?? isCheckout;
  const isPreview = mode === 'preview';
  const isCartPage = mode === 'cart';
  const bundleSelectionListing = bundleSelectionListingId
    ? listingsById.get(bundleSelectionListingId)
    : null;
  const bundleSelectionBundle = bundleSelectionListing?.bundleId
    ? (bundlesById.get(bundleSelectionListing.bundleId) ?? null)
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
      checkoutBlocked={checkoutBlocked}
      checkoutFields={checkoutFields}
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
                      ? bundlesById.get(listing.bundleId)
                      : undefined;
                    const quantity = cartQuantityByListing.get(listing.id) ?? 0;

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
