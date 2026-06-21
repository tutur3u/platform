'use client';

import { ArrowRight, Tag, TriangleAlert, Zap } from '@tuturuuu/icons';
import { ChevronDownIcon } from '@tuturuuu/icons/lucide-static';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { Button } from '../button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../collapsible';
import { AccentButton } from './accent-button';
import type {
  StorefrontBuyerDefaults,
  StorefrontCartEntry,
  StorefrontSurfaceLabels,
} from './types';
import {
  formatStorefrontPrice,
  getStorefrontLinePrice,
  getStorefrontVariantLabel,
  storefrontCartLineKey,
} from './utils';

export function CartContents({
  cartEntries,
  currency,
  hasCart,
  isCheckoutDisabled,
  labels,
  total,
}: {
  cartEntries: StorefrontCartEntry[];
  currency: string;
  hasCart: boolean;
  isCheckoutDisabled: boolean;
  labels: StorefrontSurfaceLabels;
  total: number;
}) {
  return (
    <div className="grid gap-4">
      {hasCart ? (
        <CartLines cartEntries={cartEntries} currency={currency} />
      ) : null}
      <CartTotal currency={currency} labels={labels} total={total} />
      {hasCart && !isCheckoutDisabled ? (
        <p className="flex items-center gap-2 rounded-md border border-border border-dashed bg-muted/30 px-3 py-2 text-muted-foreground text-xs leading-5">
          <Tag className="h-3.5 w-3.5 shrink-0" />
          {labels.couponNote}
        </p>
      ) : null}
      {!hasCart ? (
        <p className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {labels.emptyCart}
        </p>
      ) : null}
    </div>
  );
}

export function CartActions({
  canOpenCheckout,
  checkoutHref,
  isCheckoutDisabled,
  isPreview,
  isSubmitting,
  labels,
  onCheckoutOpen,
  onInstantCheckout,
  radius,
}: {
  canOpenCheckout: boolean;
  checkoutHref?: string;
  isCheckoutDisabled: boolean;
  isPreview: boolean;
  isSubmitting: boolean;
  labels: StorefrontSurfaceLabels;
  onCheckoutOpen?: () => void;
  onInstantCheckout?: () => void;
  radius: string;
}) {
  if (isPreview || isCheckoutDisabled) {
    return (
      <Button className={cn('w-full', radius)} disabled type="button">
        {labels.checkoutDisabled}
      </Button>
    );
  }

  if (!canOpenCheckout) {
    return (
      <Button className={cn('w-full', radius)} disabled type="button">
        {labels.checkout}
        <ArrowRight className="size-4 shrink-0" />
      </Button>
    );
  }

  return (
    <div className="grid gap-2">
      {onInstantCheckout ? (
        <AccentButton
          disabled={isSubmitting}
          onClick={onInstantCheckout}
          radius={radius}
        >
          <Zap className="size-4 shrink-0" />
          {isSubmitting ? labels.reserving : labels.instantCheckout}
        </AccentButton>
      ) : null}
      {onCheckoutOpen ? (
        <AccentButton
          disabled={isSubmitting}
          onClick={onCheckoutOpen}
          radius={radius}
        >
          {labels.checkout}
          <ArrowRight className="size-4 shrink-0" />
        </AccentButton>
      ) : (
        <Button asChild className={cn('w-full', radius)} variant="outline">
          <a href={checkoutHref}>
            {labels.checkout}
            <ArrowRight className="size-4 shrink-0" />
          </a>
        </Button>
      )}
    </div>
  );
}

export function CheckoutSection({
  children,
  defaultOpen,
  meta,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  meta?: string;
  title: string;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <div className="rounded-lg bg-muted/25 px-3 py-2">
        <CollapsibleTrigger
          className="group flex w-full items-center gap-3 text-left"
          type="button"
        >
          <span className="min-w-0 flex-1 font-semibold text-sm">{title}</span>
          {meta ? (
            <span className="max-w-[9rem] overflow-hidden text-ellipsis whitespace-nowrap text-right font-semibold text-sm tabular-nums">
              {meta}
            </span>
          ) : null}
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">{children}</CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function CheckoutContactFields({
  buyerDefaults,
  labels,
}: {
  buyerDefaults?: StorefrontBuyerDefaults;
  labels: StorefrontSurfaceLabels;
}) {
  const buyerEmail = buyerDefaults?.email?.trim() || undefined;
  const buyerName = buyerDefaults?.name?.trim() || undefined;
  const inputClassName =
    'h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40';
  const labelClassName = 'grid gap-1.5 text-sm';

  return (
    <div className="grid gap-3">
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
    </div>
  );
}

function CartLines({
  cartEntries,
  currency,
}: {
  cartEntries: StorefrontCartEntry[];
  currency: string;
}) {
  return (
    <div className="-mr-1 grid max-h-72 gap-3 overflow-y-auto pr-1">
      {cartEntries.map(({ line, listing, variant }) => {
        const unitPrice = getStorefrontLinePrice(listing, variant);
        const variantLabel = variant
          ? getStorefrontVariantLabel(variant)
          : null;
        const lineTotal = formatStorefrontPrice(
          unitPrice * line.quantity,
          currency
        );

        return (
          <div
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm"
            key={storefrontCartLineKey(line.listingId, line.variantId)}
          >
            <div className="min-w-0">
              <p className="line-clamp-2 break-words font-medium leading-5">
                {listing.title}
              </p>
              {variantLabel ? (
                <p className="line-clamp-1 break-words text-muted-foreground text-xs">
                  {variantLabel}
                </p>
              ) : null}
              <p className="text-muted-foreground text-xs tabular-nums">
                {line.quantity} × {formatStorefrontPrice(unitPrice, currency)}
              </p>
            </div>
            <span
              className="max-w-[9rem] justify-self-end overflow-hidden text-ellipsis whitespace-nowrap text-right font-medium tabular-nums leading-5 sm:max-w-[11rem]"
              title={lineTotal}
            >
              {lineTotal}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CartTotal({
  currency,
  labels,
  total,
}: {
  currency: string;
  labels: StorefrontSurfaceLabels;
  total: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-border border-t pt-4">
      <span className="text-muted-foreground text-sm">{labels.total}</span>
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right font-semibold tabular-nums">
        {formatStorefrontPrice(total, currency)}
      </span>
    </div>
  );
}
