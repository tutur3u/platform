'use client';

import { ArrowRight } from '@tuturuuu/icons';
import type { InventoryStorefront } from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import type { FormEvent } from 'react';
import { Badge } from '../badge';
import { AccentButton } from './accent-button';
import {
  CartActions,
  CartContents,
  CheckoutContactFields,
  CheckoutSection,
} from './cart-summary-parts';
import type {
  StorefrontBuyerDefaults,
  StorefrontCartEntry,
  StorefrontSurfaceLabels,
} from './types';
import { formatStorefrontPrice, storefrontSurfaceClasses } from './utils';

type StorefrontCartSummaryVariant = 'checkout' | 'panel' | 'popover';

export function StorefrontCartSummary({
  buyerDefaults,
  cartEntries,
  checkoutHref,
  className,
  currency,
  isCheckout,
  isPreview,
  isSubmitting,
  labels,
  onCheckoutOpen,
  onCheckoutSubmit,
  onInstantCheckout,
  radius,
  storefront,
  total,
  variant,
}: {
  buyerDefaults?: StorefrontBuyerDefaults;
  cartEntries: StorefrontCartEntry[];
  checkoutHref?: string;
  className?: string;
  currency: string;
  isCheckout?: boolean;
  isPreview: boolean;
  isSubmitting: boolean;
  labels: StorefrontSurfaceLabels;
  onCheckoutOpen?: () => void;
  onCheckoutSubmit?: (formData: FormData) => void;
  onInstantCheckout?: () => void;
  radius: string;
  storefront: InventoryStorefront;
  total: number;
  variant?: StorefrontCartSummaryVariant;
}) {
  const presentation = variant ?? (isCheckout ? 'checkout' : 'panel');
  const hasCart = cartEntries.length > 0;
  const isCheckoutDisabled = storefront.checkoutMode === 'disabled';
  const submitDisabled =
    !hasCart || isSubmitting || isCheckoutDisabled || !onCheckoutSubmit;
  const canOpenCheckout = hasCart && Boolean(checkoutHref || onCheckoutOpen);

  if (presentation === 'checkout') {
    return (
      <section
        aria-label={labels.checkout}
        className={cn('grid gap-5', className)}
      >
        <form
          className="grid gap-5"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            onCheckoutSubmit?.(new FormData(event.currentTarget));
          }}
        >
          <CheckoutSection
            defaultOpen={cartEntries.length > 1}
            meta={formatStorefrontPrice(total, currency)}
            title={labels.orderSummary}
          >
            <CartContents
              cartEntries={cartEntries}
              currency={currency}
              hasCart={hasCart}
              isCheckoutDisabled={isCheckoutDisabled}
              labels={labels}
              total={total}
            />
          </CheckoutSection>

          <CheckoutSection defaultOpen title={labels.contactDetails}>
            <CheckoutContactFields
              buyerDefaults={buyerDefaults}
              labels={labels}
            />
          </CheckoutSection>

          <AccentButton disabled={submitDisabled} radius={radius}>
            {isSubmitting ? labels.reserving : labels.reserve}
            <ArrowRight className="size-4 shrink-0" />
          </AccentButton>
        </form>
      </section>
    );
  }

  return (
    <section
      aria-label={labels.cart}
      className={cn(
        'h-fit',
        presentation === 'panel'
          ? cn('p-4', storefrontSurfaceClasses[storefront.surfaceStyle], radius)
          : 'grid gap-4',
        className
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold">{labels.cart}</p>
          <Badge className="border-border bg-background" variant="outline">
            {cartEntries.length}
          </Badge>
        </div>
        <p className="mt-2 text-muted-foreground text-sm leading-6">
          {labels.reservedCopy}
        </p>
      </div>

      <CartContents
        cartEntries={cartEntries}
        currency={currency}
        hasCart={hasCart}
        isCheckoutDisabled={isCheckoutDisabled}
        labels={labels}
        total={total}
      />

      <CartActions
        canOpenCheckout={canOpenCheckout}
        checkoutHref={checkoutHref}
        isCheckoutDisabled={isCheckoutDisabled}
        isPreview={isPreview}
        isSubmitting={isSubmitting}
        labels={labels}
        onCheckoutOpen={onCheckoutOpen}
        onInstantCheckout={onInstantCheckout}
        radius={radius}
      />
    </section>
  );
}
