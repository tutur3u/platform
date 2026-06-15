import { StorefrontClient } from '@/components/storefront/storefront-client';
import { StorefrontHeaderActions } from '../../storefront-header-actions';

export default async function StorefrontCartPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  return (
    <StorefrontClient
      headerActions={<StorefrontHeaderActions />}
      mode="cart"
      storeSlug={storeSlug}
    />
  );
}
