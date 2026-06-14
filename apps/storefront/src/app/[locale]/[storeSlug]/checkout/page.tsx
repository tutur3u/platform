import { StorefrontClient } from '@/components/storefront/storefront-client';

export default async function StorefrontCheckoutPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  return <StorefrontClient mode="checkout" storeSlug={storeSlug} />;
}
