import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { PurchaseHistoryClient } from '@/components/storefront/purchase-history-client';
import { StorefrontHeaderActions } from '../storefront-header-actions';

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

export default function StorefrontAllOrdersPage() {
  return <PurchaseHistoryClient headerActions={<StorefrontHeaderActions />} />;
}
