'use client';

import { ArrowRight, TriangleAlert } from '@tuturuuu/icons';
import type { InventoryStorefront } from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import type { FormEvent } from 'react';
import { Badge } from '../badge';
import { Button } from '../button';
import { AccentButton } from './accent-button';
import type { StorefrontCartEntry, StorefrontSurfaceLabels } from './types';
import { formatStorefrontPrice, storefrontSurfaceClasses } from './utils';

export function StorefrontCartSummary({
  cartEntries,
  checkoutHref,
  currency,
  isCheckout,
  isPreview,
  isSubmitting,
  labels,
  onCheckoutSubmit,
  radius,
  storefront,
  total,
}: {
  cartEntries: StorefrontCartEntry[];
  checkoutHref?: string;
  currency: string;
  isCheckout: boolean;
  isPreview: boolean;
  isSubmitting: boolean;
  labels: StorefrontSurfaceLabels;
  onCheckoutSubmit?: (formData: FormData) => void;
  radius: string;
  storefront: InventoryStorefront;
  total: number;
}) {
  const hasCart = cartEntries.length > 0;
  const isCheckoutDisabled = storefront.checkoutMode === 'disabled';
  const submitDisabled =
    !hasCart || isSubmitting || isCheckoutDisabled || !onCheckoutSubmit;
  const canOpenCheckout = hasCart && Boolean(checkoutHref);

  return (
    <aside
      className={cn(
        'h-fit p-4 lg:sticky lg:top-4',
        storefrontSurfaceClasses[storefront.surfaceStyle],
        radius
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{labels.cart}</p>
        <Badge className="border-border bg-background" variant="outline">
          {cartEntries.length}
        </Badge>
      </div>
      <p className="mt-2 text-muted-foreground text-sm leading-6">
        {labels.reservedCopy}
      </p>
      <div className="mt-4 grid gap-2">
        {cartEntries.map(({ line, listing }) => (
          <div
            className="flex items-center justify-between gap-3 text-sm"
            key={line.listingId}
          >
            <span className="min-w-0 truncate">
              {line.quantity} x {listing.title}
            </span>
            <span className="font-medium">
              {formatStorefrontPrice(listing.price * line.quantity, currency)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-border border-t pt-4">
        <span className="text-muted-foreground text-sm">{labels.total}</span>
        <span className="font-semibold">
          {formatStorefrontPrice(total, currency)}
        </span>
      </div>
      {!hasCart ? (
        <p className="mt-4 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
          <TriangleAlert className="h-4 w-4" />
          {labels.emptyCart}
        </p>
      ) : null}
      {isCheckout ? (
        <form
          className="mt-4 grid gap-2"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            onCheckoutSubmit?.(new FormData(event.currentTarget));
          }}
        >
          <textarea
            className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            name="note"
            placeholder={labels.form.note}
          />
          <AccentButton disabled={submitDisabled} radius={radius}>
            {isSubmitting ? labels.reserving : labels.reserve}
            <ArrowRight className="h-4 w-4" />
          </AccentButton>
        </form>
      ) : isPreview || isCheckoutDisabled ? (
        <Button className={cn('mt-4 w-full', radius)} disabled type="button">
          {labels.checkoutDisabled}
        </Button>
      ) : canOpenCheckout ? (
        <Button asChild className={cn('mt-4 w-full', radius)}>
          <a href={checkoutHref}>
            {labels.checkout}
            <ArrowRight className="h-4 w-4" />
          </a>
        </Button>
      ) : (
        <Button className={cn('mt-4 w-full', radius)} disabled type="button">
          {labels.checkout}
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </aside>
  );
}
