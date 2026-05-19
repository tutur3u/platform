import { InventoryOperatorClient } from '@/components/operator/inventory-operator-client';

export default async function InventoryCatalogPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <InventoryOperatorClient view="catalog" wsId={wsId} />;
}
