'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  getStorefrontVariantLimit,
  type StorefrontBuyerDefaults,
  StorefrontSurface,
  type StorefrontSurfaceLabels,
} from '@tuturuuu/ui/storefront';
import { formatMoneyFromMinor } from '@tuturuuu/utils/money';
import { useTranslations } from 'next-intl';
import { useQueryState } from 'nuqs';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { openHostedPolarCheckout } from './checkout-window';
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
  clearCartOnMount?: boolean;
  headerActions?: ReactNode;
  initialCheckoutOpen?: boolean;
  initialStorefront?: InventoryPublicStorefrontResponse | null;
  listingId?: string;
  mode: StorefrontMode;
  publicToken?: string;
  storeSlug: string;
};

export function StorefrontClient({
  buyerDefaults,
  clearCartOnMount = false,
  headerActions,
  initialCheckoutOpen = false,
  initialStorefront,
  listingId,
  mode,
  publicToken,
  storeSlug,
}: StorefrontClientProps) {
  const t = useTranslations('storefront');
  const cart = useCart(storeSlug);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [detailListingId, setDetailListingId] = useQueryState('product');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(
    initialCheckoutOpen || mode === 'checkout'
  );
  const shouldResolveDemoOrder =
    mode === 'order' && publicToken === DEMO_ORDER_PUBLIC_TOKEN;
  const storefrontQuery = useQuery({
    enabled: mode !== 'order' || shouldResolveDemoOrder,
    // Seed from the server-rendered payload so the first paint already has the
    // storefront (no client-side loading flash / waterfall).
    initialData: initialStorefront ?? undefined,
    queryFn: () => getOptionalInventoryPublicStorefront(storeSlug),
    queryKey: ['storefront', storeSlug],
    refetchOnMount: 'always',
    staleTime: 0,
  });
  const storefront = storefrontQuery.data?.storefront;
  const isDemoStorefront = isDemoStorefrontFixture(storefront);
  const isSimulatedCheckout =
    isDemoStorefront || storefront?.checkoutMode === 'simulated';
  const isSquareTerminalCheckout =
    storefront?.checkoutMode === 'square_terminal';
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
    refetchInterval: (query) => {
      const order = query.state.data?.order;
      if (!order || order.status === 'completed') return false;
      return 2000;
    },
  });
  const listings = storefrontQuery.data?.listings ?? [];
  const selectedListing = listings.find((listing) => listing.id === listingId);
  const cartListings = useMemo(
    () =>
      cart.cart.flatMap((line) => {
        const listing = listings.find((item) => item.id === line.listingId);
        if (!listing) return [];
        const variant = line.variantId
          ? (listing.variants ?? []).find((item) => item.id === line.variantId)
          : undefined;
        return [{ line, listing, variant }];
      }),
    [cart.cart, listings]
  );
  const lineLimit = (
    listing: (typeof cartListings)[number]['listing'],
    variant: (typeof cartListings)[number]['variant']
  ) =>
    variant
      ? getStorefrontVariantLimit(listing, variant)
      : getStorefrontListingLimit(listing);
  const checkoutListings = cartListings.filter(
    ({ line, listing, variant }) =>
      Math.min(line.quantity, lineLimit(listing, variant)) > 0
  );

  useEffect(() => {
    if (mode !== 'order' || orderQuery.data?.order.status !== 'completed') {
      return;
    }

    void queryClient.invalidateQueries({ queryKey: ['storefront', storeSlug] });
  }, [mode, orderQuery.data?.order.status, queryClient, storeSlug]);

  useEffect(() => {
    if (!clearCartOnMount) return;

    cart.clear();
    void queryClient.invalidateQueries({ queryKey: ['storefront', storeSlug] });
  }, [cart.clear, clearCartOnMount, queryClient, storeSlug]);

  type CheckoutLineInput = {
    listingId: string;
    variantId?: string;
    quantity: number;
  };
  type CheckoutInput = {
    lines: CheckoutLineInput[];
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string | null;
    note?: string | null;
  };

  const navigateToCheckoutResult = (url: string) => {
    let target: URL;
    try {
      target = new URL(url, window.location.origin);
    } catch {
      toast.error(t('checkoutError'));
      return;
    }

    if (target.origin !== window.location.origin) {
      toast.error(t('checkoutError'));
      return;
    }

    router.push(`${target.pathname}${target.search}${target.hash}`);
  };

  const openPolarCheckoutWindow = (checkoutUrl: string) => {
    setIsRedirecting(true);

    const result = openHostedPolarCheckout(checkoutUrl);
    if (result === 'new-tab') {
      setIsCheckoutOpen(false);
      setIsRedirecting(false);
    }
  };

  const startCheckout = (input: CheckoutInput) => {
    checkoutMutation.mutate(input);
  };

  const checkoutMutation = useMutation({
    mutationFn: async (input: CheckoutInput) => {
      if (isDemoStorefront) return createDemoCheckoutResponse(storeSlug);

      return createInventoryCheckoutSession(storeSlug, {
        customerEmail: input.customerEmail || undefined,
        customerName: input.customerName || undefined,
        customerPhone: input.customerPhone || null,
        lines: input.lines.filter((line) => line.quantity > 0),
        note: input.note ?? null,
      });
    },
    onError: (error) => {
      setIsRedirecting(false);
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t('checkoutError')
      );
    },
    onSuccess: async ({ checkoutMode, checkoutUrl, nextUrl }) => {
      const targetUrl = nextUrl ?? checkoutUrl;
      if (!targetUrl) {
        setIsRedirecting(false);
        toast.error(t('checkoutError'));
        return;
      }

      if (isSimulatedCheckout || checkoutMode === 'square_terminal') {
        cart.clear();
        setIsCheckoutOpen(false);
        navigateToCheckoutResult(targetUrl);
        return;
      }

      openPolarCheckoutWindow(targetUrl);
    },
  });

  const cartCheckoutLines = (): CheckoutLineInput[] =>
    checkoutListings.map(({ line, listing, variant }) => ({
      listingId: line.listingId,
      quantity: Math.min(line.quantity, lineLimit(listing, variant)),
      variantId: line.variantId ?? undefined,
    }));

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
                {order?.checkoutProvider === 'square_terminal'
                  ? t('squareOrderPlacedDescription')
                  : t('orderPlacedDescription')}
              </p>
              {order ? (
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 font-medium text-xs">
                  <span className="size-1.5 rounded-full bg-primary" />
                  {t('orderStatus', {
                    status:
                      order.squareStatus ?? order.polarStatus ?? order.status,
                  })}
                </span>
              ) : (
                <p className="mt-4 text-muted-foreground text-sm">
                  {t('loading')}
                </p>
              )}
              {order && order.lines.length > 0 ? (
                <div className="mt-5 rounded-xl border border-border bg-muted/10 p-4 text-left">
                  <div className="grid gap-2">
                    {order.lines.map((line) => (
                      <div
                        className="flex items-baseline justify-between gap-3 text-sm"
                        key={line.id}
                      >
                        <span className="min-w-0 truncate">
                          <span className="text-muted-foreground tabular-nums">
                            {line.quantity}×{' '}
                          </span>
                          {line.title}
                        </span>
                        <span className="shrink-0 whitespace-nowrap font-medium tabular-nums">
                          {formatMoneyFromMinor(
                            line.subtotalAmount,
                            order.currency
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-border border-t pt-3 text-sm">
                    <span className="text-muted-foreground">{t('total')}</span>
                    <span className="font-semibold tabular-nums">
                      {formatMoneyFromMinor(order.totalAmount, order.currency)}
                    </span>
                  </div>
                </div>
              ) : null}
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
  const surfaceMode = resolvedMode === 'checkout' ? 'cart' : resolvedMode;
  const surfaceLabels: Partial<StorefrontSurfaceLabels> = {
    add: t('add'),
    available: t('available'),
    browse: t('browse'),
    bundle: t('bundle'),
    buyNow: t('buyNow'),
    cart: t('cart'),
    checkout: t('checkout'),
    checkoutDisabled: t('checkoutDisabled'),
    checkoutDisabledBadge: t('checkoutDisabledBadge'),
    contactDetails: t('contactDetails'),
    demoBadge: t('demoBadge'),
    emptyCart: t('emptyCart'),
    emptyListingsDescription: t('emptyListingsDescription'),
    emptyListingsTitle: t('emptyListingsTitle'),
    fallbackDescription: t('fallbackDescription'),
    fromPrice: t('fromPrice'),
    instantCheckout: t('instantCheckout'),
    orderSummary: t('orderSummary'),
    redirectingToCheckout: t('redirectingToCheckout'),
    selectOptions: t('selectOptions'),
    viewDetails: t('viewDetails'),
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
    reserve: isSimulatedCheckout
      ? t('simulatedReserve')
      : isSquareTerminalCheckout
        ? t('squareReserve')
        : t('reserve'),
    reserving: isSimulatedCheckout
      ? t('simulatedReserving')
      : isSquareTerminalCheckout
        ? t('squareReserving')
        : t('reserving'),
    reservedCopy: isSimulatedCheckout
      ? t('simulatedReservedCopy')
      : isSquareTerminalCheckout
        ? t('squareReservedCopy')
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
      detailListingId={detailListingId}
      headerActions={headerActions}
      isDemo={isDemoStorefront}
      isRedirecting={isRedirecting}
      isSubmitting={checkoutMutation.isPending}
      labels={surfaceLabels}
      listings={listings}
      mode={surfaceMode}
      onBuyNow={(buyNowListingId, variantId) => {
        // Instant checkout for a single product, skipping the cart entirely.
        recordAnalyticsEvent({
          eventType: 'checkout_started',
          listingId: buyNowListingId,
          metadata: { instant: true, lines: 1 },
        });
        startCheckout({
          customerEmail: buyerDefaults?.email ?? undefined,
          customerName: buyerDefaults?.name ?? undefined,
          lines: [
            {
              listingId: buyNowListingId,
              quantity: 1,
              variantId: variantId ?? undefined,
            },
          ],
        });
      }}
      checkoutOpen={isCheckoutOpen}
      onCheckoutSubmit={(formData) => {
        recordAnalyticsEvent({
          eventType: 'checkout_started',
          metadata: { lines: checkoutListings.length },
        });
        startCheckout({
          customerEmail:
            String(formData.get('customerEmail') ?? '').trim() || undefined,
          customerName:
            String(formData.get('customerName') ?? '').trim() || undefined,
          customerPhone:
            String(formData.get('customerPhone') ?? '').trim() || null,
          lines: cartCheckoutLines(),
          note: String(formData.get('note') ?? '') || null,
        });
      }}
      onCheckoutOpen={() => setIsCheckoutOpen(true)}
      onCheckoutOpenChange={setIsCheckoutOpen}
      onDecrement={(selectedListingId, variantId) => {
        cart.decrement(selectedListingId, variantId);
        recordAnalyticsEvent({
          eventType: 'remove_from_cart',
          listingId: selectedListingId,
        });
      }}
      onDetailListingChange={(nextListingId) =>
        setDetailListingId(nextListingId)
      }
      onIncrement={(selectedListingId, maxQuantity, variantId) => {
        cart.increment(selectedListingId, maxQuantity, variantId);
        recordAnalyticsEvent({
          eventType: 'add_to_cart',
          listingId: selectedListingId,
        });
      }}
      onInstantCheckout={() => {
        // One-click checkout from the cart: submit directly when we already know
        // the buyer, otherwise send them to the checkout form to fill details.
        if (!buyerDefaults?.email) {
          setIsCheckoutOpen(true);
          return;
        }
        recordAnalyticsEvent({
          eventType: 'checkout_started',
          metadata: { instant: true, lines: checkoutListings.length },
        });
        startCheckout({
          customerEmail: buyerDefaults.email,
          customerName: buyerDefaults.name ?? undefined,
          lines: cartCheckoutLines(),
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
      <header className="border-border border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-11 w-16 animate-pulse rounded-2xl bg-muted" />
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-4 py-5">
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
