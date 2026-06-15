import { StorefrontClient } from '@/components/storefront/storefront-client';
import { StorefrontHeaderActions } from '../../../storefront-header-actions';

export default async function StorefrontProductPage({
  params,
}: {
  params: Promise<{ listingId: string; storeSlug: string }>;
}) {
  const { listingId, storeSlug } = await params;
  return (
    <StorefrontClient
      headerActions={<StorefrontHeaderActions />}
      listingId={listingId}
      mode="product"
      storeSlug={storeSlug}
    />
  );
}
