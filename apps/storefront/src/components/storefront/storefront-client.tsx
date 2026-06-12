'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { RefreshCw } from '@tuturuuu/icons';
import {
  createInventoryCheckoutSession,
  getInventoryPublicOrder,
} from '@tuturuuu/internal-api/inventory';
import { toast } from '@tuturuuu/ui/sonner';
import {
  getStorefrontListingLimit,
  StorefrontSurface,
  type StorefrontSurfaceLabels,
} from '@tuturuuu/ui/storefront';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useCart } from './storefront-cart';
import {
  createDemoCheckoutResponse,
  DEMO_ORDER_PUBLIC_TOKEN,
  getDemoOrderResponse,
  isDemoStorefrontFixture,
} from './storefront-fixture';
import { getOptionalInventoryPublicStorefront } from './storefront-loader';

type StorefrontMode = 'cart' | 'checkout' | 'order' | 'product' | 'store';

type StorefrontClientProps = {
  listingId?: string;
  mode: StorefrontMode;
  publicToken?: string;
  storeSlug: string;
};

export function StorefrontClient({
  listingId,
  mode,
  publicToken,
  storeSlug,
}: StorefrontClientProps) {
  const t = useTranslations('storefront');
  const cart = useCart(storeSlug);
  const shouldResolveDemoOrder =
    mode === 'order' && publicToken === DEMO_ORDER_PUBLIC_TOKEN;
  const storefrontQuery = useQuery({
    enabled: mode !== 'order' || shouldResolveDemoOrder,
    queryFn: () => getOptionalInventoryPublicStorefront(storeSlug),
    queryKey: ['storefront', storeSlug],
  });
  const storefront = storefrontQuery.data?.storefront;
  const isDemoStorefront = isDemoStorefrontFixture(storefront);
  const isSimulatedCheckout =
    isDemoStorefront || storefront?.checkoutMode === 'simulated';
  const orderQuery = useQuery({
    enabled:
      mode === 'order' &&
      !!publicToken &&
      (!shouldResolveDemoOrder || storefrontQuery.isSuccess),
    queryFn: () =>
      isDemoStorefront
        ? getDemoOrderResponse(publicToken ?? '')
        : getInventoryPublicOrder(publicToken ?? ''),
    queryKey: [
      'storefront-order',
      publicToken,
      isDemoStorefront ? 'demo-fixture' : 'live',
    ],
  });
  const listings = storefrontQuery.data?.listings ?? [];
  const selectedListing = listings.find((listing) => listing.id === listingId);
  const cartListings = useMemo(
    () =>
      cart.cart.flatMap((line) => {
        const listing = listings.find((item) => item.id === line.listingId);
        return listing ? [{ line, listing }] : [];
      }),
    [cart.cart, listings]
  );
  const checkoutListings = cartListings.filter(
    ({ line, listing }) =>
      Math.min(line.quantity, getStorefrontListingLimit(listing)) > 0
  );
  const checkoutMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      if (isDemoStorefront) return createDemoCheckoutResponse(storeSlug);

      return createInventoryCheckoutSession(storeSlug, {
        customerEmail: String(formData.get('email') ?? ''),
        customerName: String(formData.get('name') ?? ''),
        customerPhone: String(formData.get('phone') ?? '') || null,
        lines: checkoutListings
          .map(({ line, listing }) => ({
            listingId: line.listingId,
            quantity: Math.min(
              line.quantity,
              getStorefrontListingLimit(listing)
            ),
          }))
          .filter((line) => line.quantity > 0),
        note: String(formData.get('note') ?? '') || null,
      });
    },
    onError: () => toast.error(t('checkoutError')),
    onSuccess: ({ checkoutUrl }) => {
      if (!checkoutUrl) {
        toast.error(t('checkoutError'));
        return;
      }

      cart.clear();
      window.location.assign(checkoutUrl);
    },
  });

  if (mode === 'order') {
    const order = orderQuery.data?.order;
    const isOrderUnavailable =
      orderQuery.isError || (shouldResolveDemoOrder && storefrontQuery.isError);
    return (
      <main className="mx-auto grid min-h-dvh w-full max-w-3xl place-items-center px-4 py-10">
        <section className="w-full rounded-lg border border-border bg-card p-6 shadow-sm">
          <p className="text-muted-foreground text-sm">{t('order')}</p>
          <h1 className="mt-2 font-semibold text-3xl">{publicToken}</h1>
          {isOrderUnavailable ? (
            <RetryPanel
              description={t('orderErrorDescription')}
              onRetry={() => {
                if (shouldResolveDemoOrder) storefrontQuery.refetch();
                orderQuery.refetch();
              }}
              title={t('orderErrorTitle')}
            />
          ) : (
            <p className="mt-4 text-muted-foreground">
              {order
                ? t('orderStatus', {
                    status: order.polarStatus ?? order.status,
                  })
                : t('loading')}
            </p>
          )}
        </section>
      </main>
    );
  }

  if (storefrontQuery.isLoading) {
    return (
      <main className="grid min-h-dvh place-items-center px-4 text-muted-foreground">
        {t('loading')}
      </main>
    );
  }

  if (storefrontQuery.isError) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <RetryPanel
          description={t('storefrontErrorDescription')}
          onRetry={() => storefrontQuery.refetch()}
          title={t('storefrontErrorTitle')}
        />
      </main>
    );
  }

  if (!storefront) {
    return (
      <main className="grid min-h-dvh place-items-center px-4 text-muted-foreground">
        {t('notFound')}
      </main>
    );
  }

  const resolvedMode = mode === 'product' && !selectedListing ? 'store' : mode;
  const surfaceLabels: Partial<StorefrontSurfaceLabels> = {
    add: t('add'),
    available: t('available'),
    browse: t('browse'),
    bundle: t('bundle'),
    cart: t('cart'),
    checkout: t('checkout'),
    checkoutDisabled: t('checkoutDisabled'),
    checkoutDisabledBadge: t('checkoutDisabledBadge'),
    demoBadge: t('demoBadge'),
    emptyCart: t('emptyCart'),
    emptyListingsDescription: t('emptyListingsDescription'),
    emptyListingsTitle: t('emptyListingsTitle'),
    fallbackDescription: t('fallbackDescription'),
    form: {
      email: t('form.email'),
      name: t('form.name'),
      note: t('form.note'),
      phone: t('form.phone'),
    },
    privateStore: t('privateStore'),
    previewBadge: t('previewBadge'),
    product: t('product'),
    publicStore: t('publicStore'),
    quantity: t('quantity'),
    reserve: isSimulatedCheckout ? t('simulatedReserve') : t('reserve'),
    reserving: isSimulatedCheckout ? t('simulatedReserving') : t('reserving'),
    reservedCopy: isSimulatedCheckout
      ? t('simulatedReservedCopy')
      : t('reservedCopy'),
    simulatedBadge: t('simulatedBadge'),
    soldOut: t('soldOut'),
    total: t('total'),
  };

  return (
    <StorefrontSurface
      cartLines={cart.cart}
      checkoutHref={`/store/${storeSlug}/checkout`}
      isDemo={isDemoStorefront}
      isSubmitting={checkoutMutation.isPending}
      labels={surfaceLabels}
      listings={listings}
      mode={resolvedMode}
      onCheckoutSubmit={(formData) => checkoutMutation.mutate(formData)}
      onDecrement={cart.decrement}
      onIncrement={(selectedListingId, maxQuantity) => {
        cart.increment(selectedListingId, maxQuantity);
      }}
      selectedListingId={listingId}
      storefront={storefront}
    />
  );
}

function RetryPanel({
  description,
  onRetry,
  title,
}: {
  description: string;
  onRetry: () => void;
  title: string;
}) {
  const t = useTranslations('storefront');

  return (
    <section className="w-full max-w-md rounded-lg border border-destructive/25 bg-destructive/10 p-5 text-destructive">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6 opacity-80">{description}</p>
      <button
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-current/25 px-3 font-medium text-sm"
        onClick={onRetry}
        type="button"
      >
        <RefreshCw className="h-4 w-4" />
        {t('retry')}
      </button>
    </section>
  );
}
