import { getStorefrontBuyerDefaults } from '@/components/storefront/buyer-defaults';
import { StorefrontClient } from '@/components/storefront/storefront-client';

export default async function StorefrontCheckoutSuccessPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const buyerDefaults = await getStorefrontBuyerDefaults();

  return (
    <StorefrontClient
      buyerDefaults={buyerDefaults}
      clearCartOnMount
      mode="store"
      storeSlug={storeSlug}
    />
  );
}
