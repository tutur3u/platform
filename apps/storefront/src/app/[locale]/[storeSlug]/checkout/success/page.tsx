import { StorefrontRouteFromParams } from '@/components/storefront/storefront-route';

export default function StorefrontCheckoutSuccessPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  return (
    <StorefrontRouteFromParams
      clearCartOnMount
      mode="store"
      params={params}
      showHeaderActions={false}
    />
  );
}
