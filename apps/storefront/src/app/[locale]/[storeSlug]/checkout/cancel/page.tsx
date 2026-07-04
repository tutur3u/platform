import { getStorefrontBuyerDefaults } from '@/components/storefront/buyer-defaults';
import { StorefrontClient } from '@/components/storefront/storefront-client';

export default async function StorefrontCheckoutCancelPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const buyerDefaults = await getStorefrontBuyerDefaults();

  return (
    <StorefrontClient
      buyerDefaults={buyerDefaults}
      mode="cart"
      storeSlug={storeSlug}
    />
  );
}
