import { productCategoryColumns } from './columns';
import { ProductCategoryForm } from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tutur3u/supabase/next/server';
import { ProductCategory } from '@tutur3u/types/primitives/ProductCategory';
import FeatureSummary from '@tutur3u/ui/components/ui/custom/feature-summary';
import { Separator } from '@tutur3u/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';

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
  const t = await getTranslations();
  const { wsId } = await params;
  const { data, count } = await getData(wsId, await searchParams);

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-inventory-categories.plural')}
        singularTitle={t('ws-inventory-categories.singular')}
        description={t('ws-inventory-categories.description')}
        createTitle={t('ws-inventory-categories.create')}
        createDescription={t('ws-inventory-categories.create_description')}
        form={<ProductCategoryForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={data}
        columnGenerator={productCategoryColumns}
        namespace="transaction-category-data-table"
        count={count}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </>
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
