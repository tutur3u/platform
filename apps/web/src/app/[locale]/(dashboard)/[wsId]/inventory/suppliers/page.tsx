import { createClient } from '@tuturuuu/supabase/next/server';
import type { ProductSupplier } from '@tuturuuu/types/primitives/ProductSupplier';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import WorkspaceWrapper from '@/components/workspace-wrapper';
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
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
  }>;
}

export default async function WorkspaceSuppliersPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();

        const { containsPermission } = await getPermissions({
          wsId,
        });

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

        const { data, count } = await getData(wsId, await searchParams);

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
            <CustomDataTable
              data={data}
              columnGenerator={productSupplierColumns}
              namespace="basic-data-table"
              count={count}
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
    .from('inventory_suppliers')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId);

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: ProductSupplier[]; count: number };
}
