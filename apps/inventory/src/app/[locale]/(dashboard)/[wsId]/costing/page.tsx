import { InventoryOperatorClient } from '@/components/operator/inventory-operator-client';

export default async function CostingPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <InventoryOperatorClient view="costing" wsId={wsId} />;
}
