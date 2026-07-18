import { redirect } from 'next/navigation';
import { InventoryOperatorClient } from '@/components/operator/inventory-operator-client';

export default async function InventoryCommercePage({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { wsId } = await params;
  const { tab } = await searchParams;
  if (tab === 'sales') redirect(`/${wsId}/sales`);
  return <InventoryOperatorClient view="commerce" wsId={wsId} />;
}
