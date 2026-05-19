import { PublicStorefrontClient } from '@/components/storefront/public-storefront-client';

export default async function PublicStorefrontOrderPage({
  params,
}: {
  params: Promise<{ publicToken: string; storeSlug: string }>;
}) {
  const { publicToken, storeSlug } = await params;
  return (
    <PublicStorefrontClient
      mode="order"
      publicToken={publicToken}
      storeSlug={storeSlug}
    />
  );
}
