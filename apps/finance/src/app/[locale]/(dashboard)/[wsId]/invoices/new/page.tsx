import type { PermissionId } from '@tuturuuu/types';
import NewInvoicePage from '@tuturuuu/ui/finance/invoices/new-invoice-page';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

function resolveInvoiceProductPermissions(
  containsPermission: (permission: PermissionId) => boolean
) {
  const canCreateInvoices = containsPermission('create_invoices');
  const canCreateInventorySales =
    containsPermission('create_inventory_sales') || canCreateInvoices;
  const canViewInventoryCatalog =
    containsPermission('view_inventory_catalog') ||
    containsPermission('manage_inventory_catalog') ||
    containsPermission('view_inventory') ||
    containsPermission('create_inventory') ||
    containsPermission('update_inventory') ||
    containsPermission('delete_inventory');
  const canViewInventoryStock =
    containsPermission('view_inventory_stock') ||
    containsPermission('view_stock_quantity') ||
    containsPermission('adjust_inventory_stock') ||
    containsPermission('update_stock_quantity');

  return {
    canCreateInvoices,
    canReadGroupLinkedProducts:
      containsPermission('view_user_groups') || canCreateInvoices,
    canReadInvoiceProducts: canViewInventoryCatalog || canCreateInventorySales,
    canReadInvoiceProductStock:
      canViewInventoryStock || canCreateInventorySales,
  };
}

export default async function WorkspaceNewInvoicePage({ params }: Props) {
  const { wsId: id } = await params;
  const context = await getFinanceWorkspaceContext(id);
  if (!context) {
    notFound();
  }
  const invoiceProductPermissions = resolveInvoiceProductPermissions(
    context.permissions.containsPermission
  );

  return (
    <Suspense>
      <NewInvoicePage
        wsId={context.wsId}
        canCreateInvoices={invoiceProductPermissions.canCreateInvoices}
        canChangeFinanceWallets={context.permissions.containsPermission(
          'change_finance_wallets'
        )}
        canSetFinanceWalletsOnCreate={context.permissions.containsPermission(
          'set_finance_wallets_on_create'
        )}
        canReadInvoiceProducts={
          invoiceProductPermissions.canReadInvoiceProducts
        }
        canReadInvoiceProductStock={
          invoiceProductPermissions.canReadInvoiceProductStock
        }
        canReadGroupLinkedProducts={
          invoiceProductPermissions.canReadGroupLinkedProducts
        }
        permissionRequestUser={context.user}
      />
    </Suspense>
  );
}
