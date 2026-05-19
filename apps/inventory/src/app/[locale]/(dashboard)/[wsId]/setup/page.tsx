import { InventoryOperatorClient } from '@/components/operator/inventory-operator-client';

export default async function InventorySetupPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <InventoryOperatorClient view="setup" wsId={wsId} />;
}
