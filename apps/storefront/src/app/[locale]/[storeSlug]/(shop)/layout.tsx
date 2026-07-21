import { type ReactNode, Suspense } from 'react';
import { StorefrontHeaderActions } from '@/app/[locale]/storefront-header-actions';
import { getServerInventoryStorefront } from '@/components/storefront/storefront-server-loader';
import { StorefrontShell } from '@/components/storefront/storefront-shell';

function HeaderActionsFallback() {
  return <div className="h-9 w-20 animate-pulse rounded-md bg-muted" />;
}

export default async function StorefrontShopLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const response = await getServerInventoryStorefront(storeSlug);
  const storefront = response?.storefront;

  if (!storefront) return children;

  return (
    <StorefrontShell
      accountActions={
        <Suspense fallback={<HeaderActionsFallback />}>
          <StorefrontHeaderActions
            showHistory={false}
            storefront={storefront}
            storeSlug={storeSlug}
          />
        </Suspense>
      }
      storefront={storefront}
    >
      {children}
    </StorefrontShell>
  );
}
