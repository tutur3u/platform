import { PurchaseHistoryClient } from '@/components/storefront/purchase-history-client';
import { StorefrontHeaderActions } from '../../storefront-header-actions';

export default async function StorefrontOrdersPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;

  return (
    <PurchaseHistoryClient
      headerActions={<StorefrontHeaderActions storeSlug={storeSlug} />}
      storeSlug={storeSlug}
    />
  );
}
