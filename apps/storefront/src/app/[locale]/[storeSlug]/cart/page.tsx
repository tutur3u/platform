import { StorefrontClient } from '@/components/storefront/storefront-client';

export default async function StorefrontCartPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  return <StorefrontClient mode="cart" storeSlug={storeSlug} />;
}
