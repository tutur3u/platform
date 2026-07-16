import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { getStorefrontBuyerDefaults } from '@/components/storefront/buyer-defaults';
import { StorefrontClient } from '@/components/storefront/storefront-client';
import { StorefrontHeaderActions } from '../../storefront-header-actions';

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

export default async function StorefrontCheckoutPage({
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
      initialCheckoutOpen
      mode="checkout"
      storeSlug={storeSlug}
    />
  );
}
