import { createClient } from '@tuturuuu/supabase/next/server';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { productCategoryColumns } from './columns';
import { ProductCategoryForm } from './form';
import WorkspaceWrapper from '@/components/workspace-wrapper';
export const metadata: Metadata = {
  title: 'Categories',
  description:
    'Manage Categories in the Inventory area of your Tuturuuu workspace.',
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

export default async function WorkspaceProductCategoriesPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();

        const { permissions } = await getPermissions({
          wsId,
        });

        if (!permissions.includes('view_inventory')) {
          return (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <h2 className="text-lg font-semibold">
                  {t('ws-roles.inventory_access_denied')}
                </h2>
                <p className="text-muted-foreground">
                  {t('ws-roles.inventory_categories_access_denied_description')}
                </p>
              </div>
            </div>
          );
        }

        const canCreateInventory = permissions.includes('create_inventory');
        const canUpdateInventory = permissions.includes('update_inventory');
        const canDeleteInventory = permissions.includes('delete_inventory');

        const { data, count } = await getData(wsId, await searchParams);

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-inventory-categories.plural')}
              singularTitle={t('ws-inventory-categories.singular')}
              description={t('ws-inventory-categories.description')}
              createTitle={t('ws-inventory-categories.create')}
              createDescription={t(
                'ws-inventory-categories.create_description'
              )}
              form={
                canCreateInventory ? (
                  <ProductCategoryForm
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
              columnGenerator={productCategoryColumns}
              namespace="transaction-category-data-table"
              count={count}
              extraData={{
                canUpdateInventory,
                canDeleteInventory,
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
    .from('product_categories')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId);

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: ProductCategory[]; count: number };
}
