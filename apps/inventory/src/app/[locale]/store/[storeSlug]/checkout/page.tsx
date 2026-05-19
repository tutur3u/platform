import { PublicStorefrontClient } from '@/components/storefront/public-storefront-client';

export default async function PublicStorefrontCheckoutPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  return <PublicStorefrontClient mode="checkout" storeSlug={storeSlug} />;
}
