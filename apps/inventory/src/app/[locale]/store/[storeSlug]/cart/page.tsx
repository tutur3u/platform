import { PublicStorefrontClient } from '@/components/storefront/public-storefront-client';

export default async function PublicStorefrontCartPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  return <PublicStorefrontClient mode="cart" storeSlug={storeSlug} />;
}
