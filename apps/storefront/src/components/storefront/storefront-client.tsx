'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, RefreshCw } from '@tuturuuu/icons';
import {
  createInventoryCheckoutSession,
  getInventoryPublicOrder,
  type InventoryPublicStorefrontResponse,
  recordInventoryStorefrontAnalyticsEvent,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import {
  getStorefrontListingLimit,
  type StorefrontBuyerDefaults,
  StorefrontSurface,
  type StorefrontSurfaceLabels,
} from '@tuturuuu/ui/storefront';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo } from 'react';
import { Link } from '@/i18n/navigation';
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
  buyerDefaults?: StorefrontBuyerDefaults;
  headerActions?: ReactNode;
  initialStorefront?: InventoryPublicStorefrontResponse | null;
  listingId?: string;
  mode: StorefrontMode;
  publicToken?: string;
  storeSlug: string;
};

export function StorefrontClient({
  buyerDefaults,
  headerActions,
  initialStorefront,
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
    // Seed from the server-rendered payload so the first paint already has the
    // storefront (no client-side loading flash / waterfall).
    initialData: initialStorefront ?? undefined,
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

      const customerName = String(formData.get('customerName') ?? '').trim();
      const customerEmail = String(formData.get('customerEmail') ?? '').trim();
      const customerPhone = String(formData.get('customerPhone') ?? '').trim();

      return createInventoryCheckoutSession(storeSlug, {
        customerEmail: customerEmail || undefined,
        customerName: customerName || undefined,
        customerPhone: customerPhone || null,
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
    onError: (error) =>
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t('checkoutError')
      ),
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
      <main className="mx-auto grid min-h-dvh w-full max-w-lg place-items-center px-4 py-10">
        <section className="w-full overflow-hidden rounded-2xl border border-border bg-card p-6 text-center shadow-foreground/5 shadow-sm">
          {isOrderUnavailable ? (
            <>
              <p className="text-muted-foreground text-sm">{t('order')}</p>
              <h1 className="mt-2 break-all font-semibold text-2xl">
                {publicToken}
              </h1>
              <RetryPanel
                description={t('orderErrorDescription')}
                onRetry={() => {
                  if (shouldResolveDemoOrder) storefrontQuery.refetch();
                  orderQuery.refetch();
                }}
                title={t('orderErrorTitle')}
              />
            </>
          ) : (
            <>
              <div
                className="-mx-6 -mt-6 mb-6 h-1.5"
                style={{
                  backgroundColor: 'var(--storefront-accent, var(--primary))',
                }}
              />
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-primary/10 text-primary ring-8 ring-primary/5">
                <CheckCircle2 className="size-8" />
              </span>
              <h1 className="mt-5 font-semibold text-2xl tracking-tight">
                {t('orderPlaced')}
              </h1>
              <p className="mt-2 text-muted-foreground text-sm leading-6">
                {t('orderPlacedDescription')}
              </p>
              {order ? (
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 font-medium text-xs">
                  <span className="size-1.5 rounded-full bg-primary" />
                  {t('orderStatus', {
                    status: order.polarStatus ?? order.status,
                  })}
                </span>
              ) : (
                <p className="mt-4 text-muted-foreground text-sm">
                  {t('loading')}
                </p>
              )}
              <div className="mt-5 rounded-xl border border-border border-dashed bg-muted/20 p-4 text-left">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t('orderReference')}
                </p>
                <p className="mt-1 break-all font-mono text-sm">
                  {publicToken}
                </p>
              </div>
              <Button asChild className="mt-6 w-full" variant="outline">
                <Link href={`/${storeSlug}`}>{t('backToStore')}</Link>
              </Button>
            </>
          )}
        </section>
      </main>
    );
  }

  if (storefrontQuery.isLoading) {
    return <StorefrontSkeleton label={t('loading')} />;
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
  const recordAnalyticsEvent = (
    payload: Parameters<typeof recordInventoryStorefrontAnalyticsEvent>[1]
  ) => {
    if (isDemoStorefront) return;
    recordInventoryStorefrontAnalyticsEvent(storeSlug, payload).catch(
      () => undefined
    );
  };

  return (
    <StorefrontSurface
      buyerDefaults={buyerDefaults}
      cartLines={cart.cart}
      cartHref={`/${storeSlug}/cart`}
      checkoutHref={`/${storeSlug}/checkout`}
      headerActions={headerActions}
      isDemo={isDemoStorefront}
      isSubmitting={checkoutMutation.isPending}
      labels={surfaceLabels}
      listings={listings}
      mode={resolvedMode}
      onCheckoutSubmit={(formData) => {
        recordAnalyticsEvent({
          eventType: 'checkout_started',
          metadata: { lines: checkoutListings.length },
        });
        checkoutMutation.mutate(formData);
      }}
      onDecrement={(selectedListingId) => {
        cart.decrement(selectedListingId);
        recordAnalyticsEvent({
          eventType: 'remove_from_cart',
          listingId: selectedListingId,
        });
      }}
      onIncrement={(selectedListingId, maxQuantity) => {
        cart.increment(selectedListingId, maxQuantity);
        recordAnalyticsEvent({
          eventType: 'add_to_cart',
          listingId: selectedListingId,
        });
      }}
      selectedListingId={listingId}
      storefront={storefront}
      storefrontHref={`/${storeSlug}`}
    />
  );
}

const SKELETON_CARD_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];

function StorefrontSkeleton({ label }: { label: string }) {
  return (
    <main className="min-h-dvh bg-background" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="h-1 w-full bg-muted" />
      <header className="border-border border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-11 w-16 animate-pulse rounded-2xl bg-muted" />
        </div>
      </header>
      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="h-52 w-full animate-pulse rounded-2xl bg-muted" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {SKELETON_CARD_KEYS.map((key) => (
              <div
                className="animate-pulse rounded-2xl border border-border/60 bg-card p-3"
                key={key}
              >
                <div className="aspect-[4/3] w-full rounded-2xl bg-muted" />
                <div className="mt-3 h-4 w-3/4 rounded bg-muted" />
                <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
        <div className="hidden h-72 animate-pulse rounded-2xl bg-muted lg:block" />
      </section>
    </main>
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
