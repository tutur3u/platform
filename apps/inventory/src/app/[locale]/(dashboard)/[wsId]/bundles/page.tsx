import { InventoryOperatorClient } from '@/components/operator/inventory-operator-client';

export default async function InventoryBundlesPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <InventoryOperatorClient view="bundles" wsId={wsId} />;
}
