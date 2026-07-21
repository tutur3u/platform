import { StorefrontRouteFromParams } from '@/components/storefront/storefront-route';

export default function StorefrontCheckoutCancelPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  return (
    <StorefrontRouteFromParams
      mode="cart"
      params={params}
      showHeaderActions={false}
      withinSharedShell
    />
  );
}
