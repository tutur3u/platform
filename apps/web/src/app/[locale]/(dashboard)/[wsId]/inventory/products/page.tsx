import { productColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tutur3u/supabase/next/server';
import { Product } from '@tutur3u/types/primitives/Product';
import { Button } from '@tutur3u/ui/button';
import FeatureSummary from '@tutur3u/ui/custom/feature-summary';
import { Separator } from '@tutur3u/ui/separator';
import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

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

export default async function WorkspaceProductsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId } = await params;
  const { data, count } = await getData(wsId, await searchParams);

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-inventory-products.plural')}
        singularTitle={t('ws-inventory-products.singular')}
        description={t('ws-inventory-products.description')}
        createTitle={t('ws-inventory-products.create')}
        createDescription={t('ws-inventory-products.create_description')}
        action={
          <Link href="./products/new">
            <Button className="cursor-pointer">
              <Plus className="mr-2 h-4 w-4" />
              <span>{t('ws-inventory-products.create')}</span>
            </Button>
          </Link>
        }
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={data}
        columnGenerator={productColumns}
        namespace="product-data-table"
        count={count}
        defaultVisibility={{
          id: false,
          manufacturer: false,
          usage: false,
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
    .from('workspace_products')
    .select('*, product_categories(name)', {
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

  const { data: rawData, error, count } = await queryBuilder;
  if (error) throw error;

  const data = rawData.map(({ product_categories, ...rest }) => ({
    ...rest,
    category: product_categories?.name,
  }));

  return { data, count } as { data: Product[]; count: number };
}
