import { createClient } from '@tuturuuu/supabase/next/server';
import type { ProductBatch } from '@tuturuuu/types/primitives/ProductBatch';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { batchColumns } from '@/data/columns/batches';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Batches',
  description:
    'Manage Batches in the Inventory area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
  }>;
}

export default async function WorkspaceBatchesPage({
  params,
  searchParams,
}: Props) {
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

        const { data, count } = await getData(wsId, await searchParams);

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
            <CustomDataTable
              data={data}
              columnGenerator={batchColumns}
              namespace="batch-data-table"
              count={count}
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

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('inventory_batches')
    .select(
      '*, inventory_warehouses!inner(name, ws_id), inventory_suppliers(name)',
      {
        count: 'exact',
      }
    )
    .eq('inventory_warehouses.ws_id', wsId);

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data: rawData, error, count } = await queryBuilder;
  if (error) throw error;

  const data = rawData.map(
    ({ inventory_warehouses, inventory_suppliers, ...rest }) => ({
      ...rest,
      ws_id: inventory_warehouses?.ws_id,
      warehouse: inventory_warehouses?.name,
      supplier: inventory_suppliers?.name,
    })
  );

  return { data, count } as { data: ProductBatch[]; count: number };
}
