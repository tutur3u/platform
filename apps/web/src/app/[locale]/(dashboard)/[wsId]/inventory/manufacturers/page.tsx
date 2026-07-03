import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import {
  canManageInventorySetup,
  canViewInventoryCatalog,
} from '@tuturuuu/inventory-core/permissions';
import { InventoryDataTableClient } from '../_components/inventory-data-table-client';
import { productManufacturerColumns } from './columns';
import { ProductManufacturerForm } from './form';

export const metadata: Metadata = {
  title: 'Manufacturers',
  description:
    'Manage Manufacturers in the Inventory area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceManufacturersPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();

        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();

        const canViewSetup =
          canViewInventoryCatalog(permissions) ||
          canManageInventorySetup(permissions);

        if (!canViewSetup) {
          return (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <h2 className="font-semibold text-lg">
                  {t('ws-roles.inventory_access_denied')}
                </h2>
                <p className="text-muted-foreground">
                  {t(
                    'ws-roles.inventory_manufacturers_access_denied_description'
                  )}
                </p>
              </div>
            </div>
          );
        }

        const canManageSetup = canManageInventorySetup(permissions);
        const canCreateInventory = canManageSetup;
        const canUpdateInventory = canManageSetup;
        const canDeleteInventory = canManageSetup;

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-inventory-manufacturers.plural')}
              singularTitle={t('ws-inventory-manufacturers.singular')}
              description={t('ws-inventory-manufacturers.description')}
              createTitle={t('ws-inventory-manufacturers.create')}
              createDescription={t(
                'ws-inventory-manufacturers.create_description'
              )}
              form={
                canCreateInventory ? (
                  <ProductManufacturerForm
                    wsId={wsId}
                    canCreateInventory={canCreateInventory}
                    canUpdateInventory={canUpdateInventory}
                  />
                ) : undefined
              }
            />
            <Separator className="my-4" />
            <InventoryDataTableClient
              resource="manufacturers"
              wsId={wsId}
              columnGenerator={productManufacturerColumns}
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
