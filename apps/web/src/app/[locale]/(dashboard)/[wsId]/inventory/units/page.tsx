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
import { productUnitColumns } from './columns';
import { ProductUnitForm } from './form';

export const metadata: Metadata = {
  title: 'Units',
  description: 'Manage Units in the Inventory area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceUnitsPage({ params }: Props) {
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
                  {t('ws-roles.inventory_units_access_denied_description')}
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
              pluralTitle={t('ws-inventory-units.plural')}
              singularTitle={t('ws-inventory-units.singular')}
              description={t('ws-inventory-units.description')}
              createTitle={t('ws-inventory-units.create')}
              createDescription={t('ws-inventory-units.create_description')}
              form={
                canCreateInventory ? (
                  <ProductUnitForm
                    wsId={wsId}
                    canCreateInventory={canCreateInventory}
                    canUpdateInventory={canUpdateInventory}
                  />
                ) : undefined
              }
            />
            <Separator className="my-4" />
            <InventoryDataTableClient
              resource="units"
              wsId={wsId}
              columnGenerator={productUnitColumns}
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
