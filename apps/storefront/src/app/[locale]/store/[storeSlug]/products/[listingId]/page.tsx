import { StorefrontClient } from '@/components/storefront/storefront-client';

export default async function StorefrontProductPage({
  params,
}: {
  params: Promise<{ listingId: string; storeSlug: string }>;
}) {
  const { listingId, storeSlug } = await params;
  return (
    <StorefrontClient
      listingId={listingId}
      mode="product"
      storeSlug={storeSlug}
    />
  );
}
