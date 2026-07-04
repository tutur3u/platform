import { getStorefrontBuyerDefaults } from '@/components/storefront/buyer-defaults';
import { StorefrontClient } from '@/components/storefront/storefront-client';
import { StorefrontHeaderActions } from '../../storefront-header-actions';

export default async function StorefrontCartPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const buyerDefaults = await getStorefrontBuyerDefaults();

  return (
    <StorefrontClient
      buyerDefaults={buyerDefaults}
      headerActions={<StorefrontHeaderActions storeSlug={storeSlug} />}
      mode="cart"
      storeSlug={storeSlug}
    />
  );
}
