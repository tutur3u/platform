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

  const canMergeSeasons = Boolean(
    permissions?.containsPermission('update_invoices') &&
      permissions.containsPermission('delete_invoices') &&
      (permissions.containsPermission('manage_inventory_catalog') ||
        permissions.containsPermission('update_inventory'))
  );

  return (
    <InventoryOperatorClient
      canExportSales={canExportSales}
      canMergeSeasons={canMergeSeasons}
      view="sales"
      wsId={wsId}
    />
  );
}
