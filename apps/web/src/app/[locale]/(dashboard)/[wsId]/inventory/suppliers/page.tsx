import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { InventoryDataTableClient } from '../_components/inventory-data-table-client';
import { productSupplierColumns } from './columns';
import { ProductSupplierForm } from './form';

export const metadata: Metadata = {
  title: 'Suppliers',
  description:
    'Manage Suppliers in the Inventory area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceSuppliersPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();

        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();
        const { containsPermission } = permissions;

        if (!containsPermission('view_inventory')) {
          return (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <h2 className="font-semibold text-lg">
                  {t('ws-roles.inventory_access_denied')}
                </h2>
                <p className="text-muted-foreground">
                  {t('ws-roles.inventory_suppliers_access_denied_description')}
                </p>
              </div>
            </div>
          );
        }

        const canCreateInventory = containsPermission('create_inventory');
        const canUpdateInventory = containsPermission('update_inventory');
        const canDeleteInventory = containsPermission('delete_inventory');

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-inventory-suppliers.plural')}
              singularTitle={t('ws-inventory-suppliers.singular')}
              description={t('ws-inventory-suppliers.description')}
              createTitle={t('ws-inventory-suppliers.create')}
              createDescription={t('ws-inventory-suppliers.create_description')}
              form={
                canCreateInventory ? (
                  <ProductSupplierForm
                    wsId={wsId}
                    canCreateInventory={canCreateInventory}
                    canUpdateInventory={canUpdateInventory}
                  />
                ) : undefined
              }
            />
            <Separator className="my-4" />
            <InventoryDataTableClient
              resource="suppliers"
              wsId={wsId}
              columnGenerator={productSupplierColumns}
              namespace="basic-data-table"
              extraData={{
                canDeleteInventory,
                canUpdateInventory,
              }}
              defaultVisibility={{
                id: false,
                created_at: false,
              }}
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}
