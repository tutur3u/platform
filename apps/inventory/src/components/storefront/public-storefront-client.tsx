'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ShoppingCart } from '@tuturuuu/icons';
import {
  createInventoryCheckoutSession,
  getInventoryPublicOrder,
  getInventoryPublicStorefront,
} from '@tuturuuu/internal-api/inventory';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useMemo } from 'react';
import {
  CheckoutPanel,
  StorefrontListingGrid,
  useCart,
} from './public-storefront-cart';

type PublicStorefrontMode = 'cart' | 'checkout' | 'order' | 'product' | 'store';

type PublicStorefrontClientProps = {
  listingId?: string;
  mode: PublicStorefrontMode;
  publicToken?: string;
  storeSlug: string;
};

export function PublicStorefrontClient({
  listingId,
  mode,
  publicToken,
  storeSlug,
}: PublicStorefrontClientProps) {
  const t = useTranslations('inventory.storefront');
  const router = useRouter();
  const cart = useCart(storeSlug);
  const storefrontQuery = useQuery({
    enabled: mode !== 'order',
    queryFn: () => getInventoryPublicStorefront(storeSlug),
    queryKey: ['inventory-public-storefront', storeSlug],
  });
  const orderQuery = useQuery({
    enabled: mode === 'order' && !!publicToken,
    queryFn: () => getInventoryPublicOrder(publicToken ?? ''),
    queryKey: ['inventory-public-order', publicToken],
  });
  const storefront = storefrontQuery.data?.storefront;
  const listings = storefrontQuery.data?.listings ?? [];
  const selectedListing = listings.find((listing) => listing.id === listingId);
  const currencyCode = storefront?.currency ?? 'USD';
  const cartListings = useMemo(
    () =>
      cart.cart.flatMap((line) => {
        const listing = listings.find((item) => item.id === line.listingId);
        return listing ? [{ line, listing }] : [];
      }),
    [cart.cart, listings]
  );
  const total = cartListings.reduce(
    (sum, entry) => sum + (entry.listing?.price ?? 0) * entry.line.quantity,
    0
  );
  const checkoutMutation = useMutation({
    mutationFn: (formData: FormData) =>
      createInventoryCheckoutSession(storeSlug, {
        customerEmail: String(formData.get('email') ?? ''),
        customerName: String(formData.get('name') ?? ''),
        customerPhone: String(formData.get('phone') ?? '') || null,
        lines: cart.cart,
        note: String(formData.get('note') ?? '') || null,
      }),
    onSuccess: ({ checkout }) => {
      cart.clear();
      router.push(`/store/${storeSlug}/orders/${checkout.publicToken}`);
    },
  });

  if (mode === 'order') {
    const order = orderQuery.data?.order;
    return (
      <main className="mx-auto grid min-h-dvh w-full max-w-3xl place-items-center px-4 py-10">
        <section className="w-full rounded-lg border border-border bg-card p-6">
          <p className="text-muted-foreground text-sm">{t('order')}</p>
          <h1 className="mt-2 font-semibold text-3xl">{publicToken}</h1>
          <p className="mt-4 text-muted-foreground">
            {order ? t('orderStatus', { status: order.status }) : t('loading')}
          </p>
        </section>
      </main>
    );
  }

  if (!storefront) {
    return (
      <main className="grid min-h-dvh place-items-center px-4 text-muted-foreground">
        {storefrontQuery.isLoading ? t('loading') : t('notFound')}
      </main>
    );
  }

  const visibleListings =
    mode === 'product' && selectedListing ? [selectedListing] : listings;

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-border border-b bg-dynamic-surface/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-muted-foreground text-xs">{t('store')}</p>
            <h1 className="font-semibold text-2xl">{storefront.name}</h1>
          </div>
          <a
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 font-medium text-sm"
            href={`/store/${storeSlug}/cart`}
          >
            <ShoppingCart className="h-4 w-4" />
            {cart.cart.reduce((sum, line) => sum + line.quantity, 0)}
          </a>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <StorefrontListingGrid
          cartListings={cartListings}
          currencyCode={currencyCode}
          onDecrement={cart.decrement}
          onIncrement={cart.increment}
          showCart={mode === 'cart' || mode === 'checkout'}
          visibleListings={visibleListings}
        />

        <CheckoutPanel
          cartCount={cart.cart.length}
          currencyCode={currencyCode}
          isCheckout={mode === 'checkout'}
          isSubmitting={checkoutMutation.isPending}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            checkoutMutation.mutate(new FormData(event.currentTarget));
          }}
          storeSlug={storeSlug}
          total={total}
        />
      </div>
    </main>
  );
}
