import { InventoryOperatorClient } from '@/components/operator/inventory-operator-client';

export default async function InventoryCheckoutsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <InventoryOperatorClient view="checkouts" wsId={wsId} />;
}
