'use client';

import { ArrowRight, Minus, Plus, TriangleAlert } from '@tuturuuu/icons';
import type { InventoryStorefrontListing } from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';

export type CartLine = {
  listingId: string;
  quantity: number;
};

export type CartListingEntry = {
  line: CartLine;
  listing: InventoryStorefrontListing;
};

export function price(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    currency,
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);
}

function cartKey(storeSlug: string) {
  return `storefront-cart:${storeSlug}`;
}

export function useCart(storeSlug: string) {
  const [cart, setCart] = useState<CartLine[]>([]);

  useEffect(() => {
    try {
      setCart(JSON.parse(localStorage.getItem(cartKey(storeSlug)) ?? '[]'));
    } catch {
      setCart([]);
    }
  }, [storeSlug]);

  useEffect(() => {
    localStorage.setItem(cartKey(storeSlug), JSON.stringify(cart));
  }, [cart, storeSlug]);

  return {
    cart,
    clear: () => setCart([]),
    decrement: (listingId: string) =>
      setCart((current) =>
        current
          .map((line) =>
            line.listingId === listingId
              ? { ...line, quantity: line.quantity - 1 }
              : line
          )
          .filter((line) => line.quantity > 0)
      ),
    increment: (listingId: string, maxQuantity = Number.POSITIVE_INFINITY) =>
      setCart((current) => {
        const existing = current.find((line) => line.listingId === listingId);
        if (!existing) return [...current, { listingId, quantity: 1 }];
        return current.map((line) =>
          line.listingId === listingId
            ? { ...line, quantity: Math.min(line.quantity + 1, maxQuantity) }
            : line
        );
      }),
  };
}

export function getListingLimit(listing: InventoryStorefrontListing) {
  const available =
    typeof listing.availableQuantity === 'number'
      ? listing.availableQuantity
      : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(listing.maxPerOrder, available));
}

export function ProductCard({
  currencyCode,
  listing,
  onAdd,
  quantity,
}: {
  currencyCode: string;
  listing: InventoryStorefrontListing;
  onAdd: () => void;
  quantity: number;
}) {
  const t = useTranslations('storefront');
  const limit = getListingLimit(listing);
  const disabled = limit === 0 || quantity >= limit;

  return (
    <article className="grid min-h-[220px] gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      {listing.imageUrl ? (
        // biome-ignore lint/performance/noImgElement: listing images can use workspace-defined external URLs
        <img
          alt=""
          className="aspect-[4/3] w-full rounded-md border border-border object-cover"
          src={listing.imageUrl}
        />
      ) : null}
      <div>
        <p className="font-semibold text-base">{listing.title}</p>
        <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
          {listing.description ?? t('fallbackDescription')}
        </p>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{price(listing.price, currencyCode)}</p>
          <p className="text-muted-foreground text-xs">
            {listing.availableQuantity ?? t('bundleAvailability')}
          </p>
        </div>
        <button
          className="inline-flex h-9 items-center gap-2 rounded-md bg-dynamic-blue px-3 font-medium text-dynamic-blue-foreground text-sm disabled:opacity-50"
          disabled={disabled}
          onClick={onAdd}
          type="button"
        >
          <Plus className="h-4 w-4" />
          {t('add')}
        </button>
      </div>
    </article>
  );
}

export function StorefrontListingGrid({
  cartListings,
  currencyCode,
  onDecrement,
  onIncrement,
  showCart,
  visibleListings,
}: {
  cartListings: CartListingEntry[];
  currencyCode: string;
  onDecrement: (listingId: string) => void;
  onIncrement: (listingId: string) => void;
  showCart: boolean;
  visibleListings: InventoryStorefrontListing[];
}) {
  if (!showCart) {
    return (
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visibleListings.map((listing) => (
          <ProductCard
            currencyCode={currencyCode}
            key={listing.id}
            listing={listing}
            onAdd={() => onIncrement(listing.id)}
            quantity={
              cartListings.find((entry) => entry.listing.id === listing.id)
                ?.line.quantity ?? 0
            }
          />
        ))}
      </section>
    );
  }

  return (
    <section className="grid gap-3 sm:grid-cols-2">
      {cartListings.map(({ line, listing }) => (
        <div
          className="rounded-lg border border-border bg-card p-4 shadow-sm"
          key={line.listingId}
        >
          <p className="font-semibold">{listing.title}</p>
          <p className="text-muted-foreground text-sm">
            {price(listing.price, currencyCode)}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border"
              onClick={() => onDecrement(line.listingId)}
              type="button"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-8 text-center">{line.quantity}</span>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border disabled:opacity-50"
              disabled={line.quantity >= getListingLimit(listing)}
              onClick={() => onIncrement(line.listingId)}
              type="button"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

export function CheckoutPanel({
  cartCount,
  currencyCode,
  isCheckout,
  isSubmitting,
  onSubmit,
  storeSlug,
  total,
}: {
  cartCount: number;
  currencyCode: string;
  isCheckout: boolean;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  storeSlug: string;
  total: number;
}) {
  const t = useTranslations('storefront');

  return (
    <aside className="h-fit rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="font-semibold">{t('cart')}</p>
      <p className="mt-2 text-muted-foreground text-sm">{t('reservedCopy')}</p>
      <div className="mt-4 flex items-center justify-between border-border border-t pt-4">
        <span className="text-muted-foreground text-sm">{t('total')}</span>
        <span className="font-semibold">{price(total, currencyCode)}</span>
      </div>
      {cartCount === 0 ? (
        <p className="mt-4 flex items-center gap-2 rounded-md border border-dynamic-amber/25 bg-dynamic-amber/10 px-3 py-2 text-dynamic-amber text-sm">
          <TriangleAlert className="h-4 w-4" />
          {t('emptyCart')}
        </p>
      ) : null}
      {isCheckout ? (
        <form className="mt-4 grid gap-2" onSubmit={onSubmit}>
          <input
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            name="name"
            placeholder={t('form.name')}
            required
          />
          <input
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            name="email"
            placeholder={t('form.email')}
            required
            type="email"
          />
          <input
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            name="phone"
            placeholder={t('form.phone')}
          />
          <textarea
            className="min-h-20 rounded-md border border-border bg-background px-3 py-2 text-sm"
            name="note"
            placeholder={t('form.note')}
          />
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-dynamic-blue px-3 font-medium text-dynamic-blue-foreground text-sm disabled:opacity-50"
            disabled={cartCount === 0 || isSubmitting}
            type="submit"
          >
            {isSubmitting ? t('reserving') : t('reserve')}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <a
          aria-disabled={cartCount === 0}
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-dynamic-blue px-3 font-medium text-dynamic-blue-foreground text-sm aria-disabled:pointer-events-none aria-disabled:opacity-50"
          href={`/store/${storeSlug}/checkout`}
        >
          {t('checkout')}
          <ArrowRight className="h-4 w-4" />
        </a>
      )}
    </aside>
  );
}
