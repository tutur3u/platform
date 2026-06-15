import { getSatelliteCurrentUser } from '@tuturuuu/satellite/auth';
import { StorefrontClient } from '@/components/storefront/storefront-client';
import { StorefrontHeaderActions } from '../../storefront-header-actions';

export default async function StorefrontCheckoutPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const user = await getSatelliteCurrentUser('storefront').catch(() => null);

  return (
    <StorefrontClient
      buyerDefaults={{
        email: user?.email,
        name: user?.display_name ?? user?.full_name ?? user?.name,
      }}
      headerActions={<StorefrontHeaderActions />}
      mode="checkout"
      storeSlug={storeSlug}
    />
  );
}
