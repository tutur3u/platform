import { StorefrontClient } from '@/components/storefront/storefront-client';
import { StorefrontHeaderActions } from '../../../storefront-header-actions';

export default async function StorefrontOrderPage({
  params,
}: {
  params: Promise<{ publicToken: string; storeSlug: string }>;
}) {
  const { publicToken, storeSlug } = await params;
  return (
    <StorefrontClient
      headerActions={<StorefrontHeaderActions />}
      mode="order"
      publicToken={publicToken}
      storeSlug={storeSlug}
    />
  );
}
