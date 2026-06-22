import { getStorefrontBuyerDefaults } from '@/components/storefront/buyer-defaults';
import { StorefrontClient } from '@/components/storefront/storefront-client';
import { StorefrontHeaderActions } from '../../../storefront-header-actions';

export default async function StorefrontProductPage({
  params,
}: {
  params: Promise<{ listingId: string; storeSlug: string }>;
}) {
  const { listingId, storeSlug } = await params;
  const buyerDefaults = await getStorefrontBuyerDefaults();

  return (
    <StorefrontClient
      buyerDefaults={buyerDefaults}
      headerActions={<StorefrontHeaderActions storeSlug={storeSlug} />}
      listingId={listingId}
      mode="product"
      storeSlug={storeSlug}
    />
  );
}
