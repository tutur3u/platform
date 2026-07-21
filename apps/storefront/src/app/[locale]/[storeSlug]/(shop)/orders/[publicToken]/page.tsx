import { StorefrontClient } from '@/components/storefront/storefront-client';

export default async function StorefrontOrderPage({
  params,
}: {
  params: Promise<{ publicToken: string; storeSlug: string }>;
}) {
  const { publicToken, storeSlug } = await params;

  return (
    <StorefrontClient
      mode="order"
      publicToken={publicToken}
      storeSlug={storeSlug}
      withinSharedShell
    />
  );
}
