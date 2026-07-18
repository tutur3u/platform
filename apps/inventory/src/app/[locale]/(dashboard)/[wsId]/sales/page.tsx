import { InventoryOperatorClient } from '@/components/operator/inventory-operator-client';

export default async function InventorySalesPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <InventoryOperatorClient view="sales" wsId={wsId} />;
}
