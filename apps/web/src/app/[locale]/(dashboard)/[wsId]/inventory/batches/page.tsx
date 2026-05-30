import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { batchColumns } from '@/data/columns/batches';
import { InventoryDataTableClient } from '../_components/inventory-data-table-client';

export const metadata: Metadata = {
  title: 'Batches',
  description:
    'Manage Batches in the Inventory area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceBatchesPage({ params }: Props) {
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
                  {t('ws-roles.inventory_batches_access_denied_description')}
                </p>
              </div>
            </div>
          );
        }

        // const canCreateInventory = containsPermission('create_inventory');
        // const canUpdateInventory = containsPermission('update_inventory');
        // const canDeleteInventory = containsPermission('delete_inventory');

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-inventory-batches.plural')}
              singularTitle={t('ws-inventory-batches.singular')}
              description={t('ws-inventory-batches.description')}
              createTitle={t('ws-inventory-batches.create')}
              createDescription={t('ws-inventory-batches.create_description')}
              // form={<BatchForm wsId={wsId} />}
            />
            <Separator className="my-4" />
            <InventoryDataTableClient
              resource="batches"
              wsId={wsId}
              columnGenerator={batchColumns}
              namespace="batch-data-table"
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
