import { PublicStorefrontClient } from '@/components/storefront/public-storefront-client';

export default async function PublicStorefrontPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  return <PublicStorefrontClient mode="store" storeSlug={storeSlug} />;
}
