import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { InventoryDataTableClient } from '../_components/inventory-data-table-client';
import { productWarehouseColumns } from './columns';
import { ProductWarehouseForm } from './form';

export const metadata: Metadata = {
  title: 'Warehouses',
  description:
    'Manage Warehouses in the Inventory area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceWarehousesPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();

        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();
        const { withoutPermission, containsPermission } = permissions;

        if (withoutPermission('view_inventory')) {
          return (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <h2 className="font-semibold text-lg">
                  {t('ws-roles.inventory_access_denied')}
                </h2>
                <p className="text-muted-foreground">
                  {t('ws-roles.inventory_warehouses_access_denied_description')}
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
              pluralTitle={t('ws-inventory-warehouses.plural')}
              singularTitle={t('ws-inventory-warehouses.singular')}
              description={t('ws-inventory-warehouses.description')}
              createTitle={t('ws-inventory-warehouses.create')}
              createDescription={t(
                'ws-inventory-warehouses.create_description'
              )}
              form={
                canCreateInventory ? (
                  <ProductWarehouseForm
                    wsId={wsId}
                    canCreateInventory={canCreateInventory}
                    canUpdateInventory={canUpdateInventory}
                  />
                ) : undefined
              }
            />
            <Separator className="my-4" />
            <InventoryDataTableClient
              resource="warehouses"
              wsId={wsId}
              columnGenerator={productWarehouseColumns}
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
