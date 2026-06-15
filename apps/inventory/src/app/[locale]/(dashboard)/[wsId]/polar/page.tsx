import { InventoryOperatorClient } from '@/components/operator/inventory-operator-client';

export default async function InventoryPolarPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <InventoryOperatorClient view="polar" wsId={wsId} />;
}
