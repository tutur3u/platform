import { StorefrontClient } from '@/components/storefront/storefront-client';
import { getOptionalInventoryPublicStorefront } from '@/components/storefront/storefront-loader';
import { StorefrontHeaderActions } from '../storefront-header-actions';

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  // Resolve the storefront on the server so the first paint already has data.
  // Falls back to null (client query still runs) if the server fetch fails.
  const initialStorefront = await getOptionalInventoryPublicStorefront(
    storeSlug
  ).catch(() => null);

  return (
    <StorefrontClient
      headerActions={<StorefrontHeaderActions storeSlug={storeSlug} />}
      initialStorefront={initialStorefront}
      mode="store"
      storeSlug={storeSlug}
    />
  );
}
