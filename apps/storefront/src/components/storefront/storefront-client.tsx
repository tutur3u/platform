'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from '@tuturuuu/icons';
import {
  createInventoryCheckoutSession,
  getInventoryPublicOrder,
  getInventorySquareCheckoutOptions,
  type InventoryPublicStorefrontResponse,
  recordInventoryStorefrontAnalyticsEvent,
} from '@tuturuuu/internal-api/inventory';
import { toast } from '@tuturuuu/ui/sonner';
import {
  getStorefrontListingLimit,
  getStorefrontVariantLimit,
  type StorefrontBuyerDefaults,
  StorefrontSurface,
  type StorefrontSurfaceLabels,
} from '@tuturuuu/ui/storefront';
import { useTranslations } from 'next-intl';
import { useQueryState } from 'nuqs';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import {
  openHostedPolarCheckout,
  openSquarePosCheckout,
} from './checkout-window';
import { SquareCheckoutRouting } from './square-checkout-routing';
import { useCart } from './storefront-cart';
import {
  createDemoCheckoutResponse,
  DEMO_ORDER_PUBLIC_TOKEN,
  getDemoOrderResponse,
  isDemoStorefrontFixture,
} from './storefront-fixture';
import { getOptionalInventoryPublicStorefront } from './storefront-loader';
import { StorefrontOrderScreen } from './storefront-order-screen';
import { getStorefrontOrderState } from './storefront-order-state';
import { StorefrontSkeleton } from './storefront-skeleton';
import { StorefrontUnavailable } from './storefront-unavailable';
import { useStorefrontSquareDevice } from './use-storefront-square-device';

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
  withinSharedShell?: boolean;
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
  withinSharedShell = false,
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
    refetchOnMount: false,
    staleTime: 60_000,
  });
  const storefront = storefrontQuery.data?.storefront;
  const isDemoStorefront = isDemoStorefrontFixture(storefront);
  const isSimulatedCheckout =
    isDemoStorefront || storefront?.checkoutMode === 'simulated';
  const isSquareTerminalCheckout =
    storefront?.checkoutMode === 'square_terminal';
  const isSquarePosCheckout = storefront?.checkoutMode === 'square_pos';
  const isSquareCheckout = isSquareTerminalCheckout || isSquarePosCheckout;
  const checkoutOptionsQuery = useQuery({
    enabled: Boolean(storefront && isSquareCheckout && !isDemoStorefront),
    queryFn: () => getInventorySquareCheckoutOptions(storeSlug),
    queryKey: ['storefront', storeSlug, 'square-checkout-options'],
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
  const squareDevice = useStorefrontSquareDevice({
    defaultDeviceId: checkoutOptionsQuery.data?.defaultDeviceId,
    devices: checkoutOptionsQuery.data?.devices ?? [],
    storeSlug,
  });
  const resolvedSquareDeviceId = squareDevice.selectedDeviceId;
  const checkoutRoutingBlocked =
    isSquareCheckout &&
    (checkoutOptionsQuery.isPending ||
      checkoutOptionsQuery.isError ||
      !checkoutOptionsQuery.data?.staffAuthorized ||
      (isSquareTerminalCheckout && !resolvedSquareDeviceId));
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
      if (!order || getStorefrontOrderState(order) !== 'pending') return false;
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
    bundleSelections?: NonNullable<
      (typeof cart.cart)[number]['bundleSelections']
    >;
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
    squareDeviceId?: string | null;
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

  const redirectToPolarCheckout = (checkoutUrl: string) => {
    setIsRedirecting(true);
    openHostedPolarCheckout(checkoutUrl);
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
        squareDeviceId: input.squareDeviceId ?? null,
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
    onSuccess: async ({ checkoutMode, checkoutUrl, nextUrl, squarePos }) => {
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

      if (checkoutMode === 'square_pos') {
        if (!squarePos) {
          setIsRedirecting(false);
          toast.error(t('checkoutError'));
          return;
        }
        cart.clear();
        setIsCheckoutOpen(false);
        setIsRedirecting(true);
        openSquarePosCheckout(squarePos);
        return;
      }

      redirectToPolarCheckout(targetUrl);
    },
  });

  const cartCheckoutLines = (): CheckoutLineInput[] =>
    checkoutListings.map(({ line, listing, variant }) => ({
      bundleSelections: line.bundleSelections,
      listingId: line.listingId,
      quantity: Math.min(line.quantity, lineLimit(listing, variant)),
      variantId: line.variantId ?? undefined,
    }));

  if (mode === 'order') {
    const order = orderQuery.data?.order;
    const isOrderUnavailable =
      orderQuery.isError || (shouldResolveDemoOrder && storefrontQuery.isError);
    return (
      <StorefrontOrderScreen
        isUnavailable={isOrderUnavailable}
        onRetry={() => {
          if (shouldResolveDemoOrder) storefrontQuery.refetch();
          orderQuery.refetch();
        }}
        order={order}
        publicToken={publicToken}
        storeSlug={storeSlug}
        withinSharedShell={withinSharedShell}
      />
    );
  }

  if (storefrontQuery.isLoading) {
    return (
      <StorefrontSkeleton
        label={t('loading')}
        withinSharedShell={withinSharedShell}
      />
    );
  }

  if (storefrontQuery.isError) {
    return (
      <main
        className={
          withinSharedShell
            ? 'grid min-h-[calc(100dvh-4.3125rem)] place-items-center px-4'
            : 'grid min-h-dvh place-items-center px-4'
        }
      >
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
      <StorefrontUnavailable
        description={t('unavailableDescription')}
        eyebrow={t('unavailableEyebrow')}
        hint={t('unavailableHint')}
        onRetry={() => storefrontQuery.refetch()}
        retryLabel={t('retry')}
        title={t('unavailableTitle')}
        withinSharedShell={withinSharedShell}
      />
    );
  }

  const resolvedMode = mode === 'product' && !selectedListing ? 'store' : mode;
  const surfaceMode = resolvedMode === 'checkout' ? 'cart' : resolvedMode;
  const surfaceLabels: Partial<StorefrontSurfaceLabels> = {
    add: t('add'),
    allItems: t('allItems'),
    available: t('available'),
    browse: t('browse'),
    bundle: t('bundle'),
    bundles: t('bundles'),
    bundleSelectionTitle: t('bundleSelectionTitle'),
    buyNow:
      isSquareTerminalCheckout || isSquarePosCheckout
        ? t('squareBuyNow')
        : t('buyNow'),
    cart: t('cart'),
    cheapestFreePreview: t('cheapestFreePreview'),
    checkout: t('checkout'),
    checkoutDisabled: t('checkoutDisabled'),
    checkoutDisabledBadge: t('checkoutDisabledBadge'),
    clearFilters: t('clearFilters'),
    contactDetails: t('contactDetails'),
    demoBadge: t('demoBadge'),
    emptyCart: t('emptyCart'),
    emptyListingsDescription: t('emptyListingsDescription'),
    emptyListingsTitle: t('emptyListingsTitle'),
    fallbackDescription: t('fallbackDescription'),
    fromPrice: t('fromPrice'),
    instantCheckout: t('instantCheckout'),
    noResultsDescription: t('noResultsDescription'),
    noResultsTitle: t('noResultsTitle'),
    orderSummary: t('orderSummary'),
    onlineCheckout: t('onlineCheckout'),
    onlineCheckoutDescription: t('onlineCheckoutDescription'),
    redirectingToCheckout: t('redirectingToCheckout'),
    requiredItems: t.raw('requiredItems') as string,
    searchBundleItems: t('searchBundleItems'),
    searchStore: t('searchStore'),
    selectOptions: t('selectOptions'),
    selectedItems: t.raw('selectedItems') as string,
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
    products: t('products'),
    publicStore: t('publicStore'),
    quantity: t('quantity'),
    reserve: isSimulatedCheckout
      ? t('simulatedReserve')
      : isSquarePosCheckout
        ? t('squarePosReserve')
        : isSquareTerminalCheckout
          ? t('squareReserve')
          : t('reserve'),
    reserving: isSimulatedCheckout
      ? t('simulatedReserving')
      : isSquarePosCheckout
        ? t('squarePosReserving')
        : isSquareTerminalCheckout
          ? t('squareReserving')
          : t('reserving'),
    reservedCopy: isSimulatedCheckout
      ? t('simulatedReservedCopy')
      : isSquarePosCheckout
        ? t('squarePosReservedCopy')
        : isSquareTerminalCheckout
          ? t('squareReservedCopy')
          : t('reservedCopy'),
    simulatedBadge: t('simulatedBadge'),
    soldOut: t('soldOut'),
    squareTerminal: t('squareTerminal'),
    squareTerminalDescription: t('squareTerminalDescription'),
    shopTitle: t('shopTitle'),
    total: t('total'),
    visibleItems: t.raw('visibleItems') as string,
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
      bundles={storefrontQuery.data?.bundles ?? []}
      buyerDefaults={buyerDefaults}
      cartLines={cart.cart}
      cartHref={`/${storeSlug}/cart`}
      checkoutHref={`/${storeSlug}/checkout`}
      checkoutBlocked={checkoutRoutingBlocked}
      checkoutFields={
        isSquareCheckout ? (
          <SquareCheckoutRouting
            errorMessage={
              checkoutOptionsQuery.error instanceof Error
                ? checkoutOptionsQuery.error.message
                : null
            }
            isLoading={checkoutOptionsQuery.isPending}
            isDeviceRemembered={squareDevice.isRemembered}
            onDeviceChange={squareDevice.selectDevice}
            onRetry={() => checkoutOptionsQuery.refetch()}
            options={checkoutOptionsQuery.data}
            selectedDeviceId={resolvedSquareDeviceId}
          />
        ) : undefined
      }
      detailListingId={detailListingId}
      headerActions={headerActions}
      isDemo={isDemoStorefront}
      isRedirecting={isRedirecting}
      isSubmitting={checkoutMutation.isPending}
      labels={surfaceLabels}
      linkComponent={Link}
      listings={listings}
      mode={surfaceMode}
      onBuyNow={(buyNowListingId, variantId) => {
        if (checkoutRoutingBlocked) {
          toast.error(
            checkoutOptionsQuery.error instanceof Error
              ? checkoutOptionsQuery.error.message
              : t('squareStaffRequiredDescription')
          );
          return;
        }
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
          squareDeviceId: isSquareTerminalCheckout
            ? resolvedSquareDeviceId
            : null,
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
          squareDeviceId: isSquareTerminalCheckout
            ? resolvedSquareDeviceId
            : null,
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
      onAddCartLine={(line, maxQuantity) => {
        cart.addLine(line, maxQuantity);
        recordAnalyticsEvent({
          eventType: 'add_to_cart',
          listingId: line.listingId,
          metadata: { configuredBundle: Boolean(line.bundleSelections) },
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
        if (checkoutRoutingBlocked) {
          setIsCheckoutOpen(true);
          return;
        }
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
          squareDeviceId: isSquareTerminalCheckout
            ? resolvedSquareDeviceId
            : null,
        });
      }}
      selectedListingId={listingId}
      storefront={storefront}
      storefrontHref={`/${storeSlug}`}
      withinSharedShell={withinSharedShell}
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
