import { PurchaseHistoryClient } from '@/components/storefront/purchase-history-client';
import { StorefrontHeaderActions } from '../storefront-header-actions';

export default function StorefrontAllOrdersPage() {
  return <PurchaseHistoryClient headerActions={<StorefrontHeaderActions />} />;
}
