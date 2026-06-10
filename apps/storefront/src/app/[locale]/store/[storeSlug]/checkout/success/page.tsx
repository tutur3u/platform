import { StorefrontClient } from '@/components/storefront/storefront-client';

export default async function StorefrontCheckoutSuccessPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  return <StorefrontClient mode="store" storeSlug={storeSlug} />;
}
