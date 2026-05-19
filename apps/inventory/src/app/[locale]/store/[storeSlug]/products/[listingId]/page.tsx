import { PublicStorefrontClient } from '@/components/storefront/public-storefront-client';

export default async function PublicStorefrontProductPage({
  params,
}: {
  params: Promise<{ listingId: string; storeSlug: string }>;
}) {
  const { listingId, storeSlug } = await params;
  return (
    <PublicStorefrontClient
      listingId={listingId}
      mode="product"
      storeSlug={storeSlug}
    />
  );
}
