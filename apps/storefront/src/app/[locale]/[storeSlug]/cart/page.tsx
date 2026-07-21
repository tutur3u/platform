import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { StorefrontRouteFromParams } from '@/components/storefront/storefront-route';

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

export default function StorefrontCartPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  return <StorefrontRouteFromParams mode="cart" params={params} />;
}
