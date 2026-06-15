'use client';

import { ArrowRight, Tag, TriangleAlert } from '@tuturuuu/icons';
import type { InventoryStorefront } from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import type { FormEvent } from 'react';
import { Badge } from '../badge';
import { Button } from '../button';
import { AccentButton } from './accent-button';
import { StorefrontImagePanel } from './image-panel';
import type {
  StorefrontBuyerDefaults,
  StorefrontCartEntry,
  StorefrontSurfaceLabels,
} from './types';
import { formatStorefrontPrice, storefrontSurfaceClasses } from './utils';

export function StorefrontCartSummary({
  buyerDefaults,
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
  buyerDefaults?: StorefrontBuyerDefaults;
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
  const buyerEmail = buyerDefaults?.email?.trim() || undefined;
  const buyerName = buyerDefaults?.name?.trim() || undefined;
  const inputClassName =
    'h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40';
  const labelClassName = 'grid gap-1.5 text-sm';

  return (
    <aside
      className={cn(
        'h-fit p-4 lg:sticky lg:top-4',
        isCheckout ? 'p-5 sm:p-6' : null,
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
      <div className="mt-4 -mr-1 grid max-h-72 gap-2.5 overflow-y-auto pr-1">
        {cartEntries.map(({ line, listing }) => (
          <div className="flex items-center gap-3 text-sm" key={line.listingId}>
            <StorefrontImagePanel
              className={cn('size-10 shrink-0 rounded-md', radius)}
              imageUrl={listing.imageUrl}
              label={listing.title}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{listing.title}</p>
              <p className="truncate text-muted-foreground text-xs tabular-nums">
                {line.quantity} ×{' '}
                {formatStorefrontPrice(listing.price, currency)}
              </p>
            </div>
            <span className="shrink-0 whitespace-nowrap font-medium tabular-nums">
              {formatStorefrontPrice(listing.price * line.quantity, currency)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-border border-t pt-4">
        <span className="text-muted-foreground text-sm">{labels.total}</span>
        <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums">
          {formatStorefrontPrice(total, currency)}
        </span>
      </div>
      {hasCart && !isCheckoutDisabled ? (
        <p className="mt-3 flex items-center gap-2 rounded-md border border-border border-dashed bg-muted/30 px-3 py-2 text-muted-foreground text-xs leading-5">
          <Tag className="h-3.5 w-3.5 shrink-0" />
          {labels.couponNote}
        </p>
      ) : null}
      {!hasCart ? (
        <p className="mt-4 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
          <TriangleAlert className="h-4 w-4" />
          {labels.emptyCart}
        </p>
      ) : null}
      {isCheckout ? (
        <form
          className="mt-5 grid gap-3"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            onCheckoutSubmit?.(new FormData(event.currentTarget));
          }}
        >
          <label className={labelClassName}>
            <span className="font-medium text-xs">{labels.form.name}</span>
            <input
              autoComplete="name"
              className={inputClassName}
              defaultValue={buyerName}
              name="customerName"
              placeholder={labels.form.name}
              required
            />
          </label>
          <label className={labelClassName}>
            <span className="font-medium text-xs">{labels.form.email}</span>
            <input
              autoComplete="email"
              className={inputClassName}
              defaultValue={buyerEmail}
              name="customerEmail"
              placeholder={labels.form.email}
              required
              type="email"
            />
          </label>
          <label className={labelClassName}>
            <span className="font-medium text-xs">{labels.form.phone}</span>
            <input
              autoComplete="tel"
              className={inputClassName}
              name="customerPhone"
              placeholder={labels.form.phone}
              type="tel"
            />
          </label>
          <textarea
            className="min-h-24 rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
            name="note"
            placeholder={labels.form.note}
          />
          <AccentButton disabled={submitDisabled} radius={radius}>
            {isSubmitting ? labels.reserving : labels.reserve}
            <ArrowRight className="size-4 shrink-0" />
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
            <ArrowRight className="size-4 shrink-0" />
          </a>
        </Button>
      ) : (
        <Button className={cn('mt-4 w-full', radius)} disabled type="button">
          {labels.checkout}
          <ArrowRight className="size-4 shrink-0" />
        </Button>
      )}
    </aside>
  );
}
