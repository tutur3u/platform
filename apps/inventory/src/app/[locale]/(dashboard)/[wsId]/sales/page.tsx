import { canViewInventorySales } from '@tuturuuu/inventory-core/permissions';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { connection } from 'next/server';
import { InventoryOperatorClient } from '@/components/operator/inventory-operator-client';

export default async function InventorySalesPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;
  const user = await getSatelliteAppSessionUser('inventory');
  const permissions = user ? await getPermissions({ user, wsId }) : null;
  const canExportSales = Boolean(
    permissions &&
      canViewInventorySales(permissions) &&
      permissions.containsPermission('export_finance_data')
  );

  return (
    <InventoryOperatorClient
      canExportSales={canExportSales}
      view="sales"
      wsId={wsId}
    />
  );
}
