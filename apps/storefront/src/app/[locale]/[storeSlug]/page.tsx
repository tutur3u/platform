import { connection } from 'next/server';
import { getStorefrontBuyerDefaults } from '@/components/storefront/buyer-defaults';
import { StorefrontClient } from '@/components/storefront/storefront-client';
import { getOptionalInventoryPublicStorefront } from '@/components/storefront/storefront-loader';
import { INVENTORY_APP_URL } from '@/constants/common';
import { StorefrontHeaderActions } from '../storefront-header-actions';

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  await connection();
  const { storeSlug } = await params;
  // Resolve the storefront on the server so the first paint already has data.
  // Falls back to null (client query still runs) if the server fetch fails.
  const [buyerDefaults, initialStorefront] = await Promise.all([
    getStorefrontBuyerDefaults(),
    getOptionalInventoryPublicStorefront(storeSlug, {
      baseUrl: INVENTORY_APP_URL,
    }).catch(() => null),
  ]);

  return (
    <StorefrontClient
      buyerDefaults={buyerDefaults}
      headerActions={
        <StorefrontHeaderActions
          storefront={initialStorefront?.storefront ?? null}
          storeSlug={storeSlug}
        />
      }
      initialStorefront={initialStorefront}
      mode="store"
      storeSlug={storeSlug}
    />
  );
}
