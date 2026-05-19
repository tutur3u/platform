import { InventoryOperatorClient } from '@/components/operator/inventory-operator-client';

export default async function InventoryStockPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <InventoryOperatorClient view="stock" wsId={wsId} />;
}
