import { connection } from 'next/server';
import { PosDeviceManagementPage } from '@/components/operator/pos-device-management-page';

export default async function InventoryPosDevicesPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;
  return <PosDeviceManagementPage wsId={wsId} />;
}
