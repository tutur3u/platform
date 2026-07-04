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
      <DialogContent className="max-h-[90vh] w-[calc(100%-1.5rem)] max-w-5xl overflow-y-auto sm:w-[calc(100%-2rem)]">
        {listing ? (
          <>
            <DialogTitle className="sr-only">{listing.title}</DialogTitle>
            <StorefrontProductDetail
              cartHref={cartHref}
              cartLines={cartLines}
              currency={currency}
              isSubmitting={isSubmitting}
              labels={labels}
              listing={listing}
              onBuyNow={onBuyNow}
              onDecrement={onDecrement}
              onIncrement={onIncrement}
              quantity={0}
              radius={radius}
              showInventoryBadges={showInventoryBadges}
              surfaceClassName={surfaceClassName}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
