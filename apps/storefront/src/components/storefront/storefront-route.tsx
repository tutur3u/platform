import { Suspense } from 'react';
import { StorefrontHeaderActions } from '@/app/[locale]/storefront-header-actions';
import { getStorefrontBuyerDefaults } from './buyer-defaults';
import { StorefrontClient } from './storefront-client';
import { getServerInventoryStorefront } from './storefront-server-loader';
import { StorefrontSkeleton } from './storefront-skeleton';

type StorefrontRouteProps = {
  clearCartOnMount?: boolean;
  initialCheckoutOpen?: boolean;
  listingId?: string;
  mode: 'cart' | 'checkout' | 'product' | 'store';
  showHeaderActions?: boolean;
  storeSlug: string;
  withinSharedShell?: boolean;
};

type StorefrontRouteFromParamsProps = Omit<
  StorefrontRouteProps,
  'listingId' | 'storeSlug'
> & {
  params: Promise<{ listingId?: string; storeSlug: string }>;
};

async function StorefrontRouteContent({
  clearCartOnMount,
  initialCheckoutOpen,
  listingId,
  mode,
  showHeaderActions = true,
  storeSlug,
  withinSharedShell = false,
}: StorefrontRouteProps) {
  const [buyerDefaults, initialStorefront] = await Promise.all([
    getStorefrontBuyerDefaults(),
    getServerInventoryStorefront(storeSlug),
  ]);

  return (
    <StorefrontClient
      buyerDefaults={buyerDefaults}
      clearCartOnMount={clearCartOnMount}
      headerActions={
        showHeaderActions ? (
          <StorefrontHeaderActions
            storefront={initialStorefront?.storefront ?? null}
            storeSlug={storeSlug}
          />
        ) : undefined
      }
      initialCheckoutOpen={initialCheckoutOpen}
      initialStorefront={initialStorefront}
      listingId={listingId}
      mode={mode}
      storeSlug={storeSlug}
      withinSharedShell={withinSharedShell}
    />
  );
}

export function StorefrontRoute(props: StorefrontRouteProps) {
  return (
    <Suspense
      fallback={
        <StorefrontSkeleton withinSharedShell={props.withinSharedShell} />
      }
    >
      <StorefrontRouteContent {...props} />
    </Suspense>
  );
}

async function StorefrontRouteParamsContent({
  params,
  ...props
}: StorefrontRouteFromParamsProps) {
  const { listingId, storeSlug } = await params;
  return (
    <StorefrontRouteContent
      {...props}
      listingId={listingId}
      storeSlug={storeSlug}
    />
  );
}

export function StorefrontRouteFromParams(
  props: StorefrontRouteFromParamsProps
) {
  return (
    <Suspense
      fallback={
        <StorefrontSkeleton withinSharedShell={props.withinSharedShell} />
      }
    >
      <StorefrontRouteParamsContent {...props} />
    </Suspense>
  );
}
