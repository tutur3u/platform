import { connection } from 'next/server';
import { InventoryAnalyticsClient } from '@/components/operator/inventory-analytics-client';

export default async function InventoryAnalyticsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;
  return <InventoryAnalyticsClient wsId={wsId} />;
}
