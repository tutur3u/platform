'use client';

import type { InventoryStorefrontListing } from '@tuturuuu/internal-api/inventory';
import { Dialog, DialogContent, DialogTitle } from '../dialog';
import { StorefrontProductDetail } from './product-detail';
import type { StorefrontCartLine, StorefrontSurfaceLabels } from './types';

/**
 * Large product detail dialog opened from a listing card. Reuses the same
 * StorefrontProductDetail body as the dedicated product route, so the dialog
 * and the deep-link page stay visually identical.
 */
export function StorefrontProductDialog({
  cartHref,
  cartLines,
  checkoutMode,
  currency,
  isSubmitting,
  labels,
  listing,
  onBuyNow,
  onDecrement,
  onIncrement,
  onOpenChange,
  radius,
  showInventoryBadges,
  surfaceClassName,
}: {
  cartHref?: string;
  cartLines?: StorefrontCartLine[];
  checkoutMode?: Parameters<typeof StorefrontProductDetail>[0]['checkoutMode'];
  currency: string;
  isSubmitting?: boolean;
  labels: StorefrontSurfaceLabels;
  listing: InventoryStorefrontListing | null;
  onBuyNow?: (listingId: string, variantId?: string | null) => void;
  onDecrement?: (listingId: string, variantId?: string | null) => void;
  onIncrement?: (
    listingId: string,
    maxQuantity: number,
    variantId?: string | null
  ) => void;
  onOpenChange: (open: boolean) => void;
  radius: string;
  showInventoryBadges: boolean;
  surfaceClassName: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(listing)}>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-none overflow-hidden border-border p-0 shadow-2xl sm:w-[calc(100%-2rem)] sm:max-w-6xl">
        {listing ? (
          <>
            <DialogTitle className="sr-only">{listing.title}</DialogTitle>
            <StorefrontProductDetail
              cartHref={cartHref}
              cartLines={cartLines}
              checkoutMode={checkoutMode}
              currency={currency}
              isSubmitting={isSubmitting}
              labels={labels}
              listing={listing}
              onBuyNow={onBuyNow}
              onDecrement={onDecrement}
              onIncrement={onIncrement}
              quantity={0}
              radius={radius}
              presentation="dialog"
              showInventoryBadges={showInventoryBadges}
              surfaceClassName={surfaceClassName}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
