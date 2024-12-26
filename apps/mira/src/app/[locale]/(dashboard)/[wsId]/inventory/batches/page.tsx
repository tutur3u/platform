import { CustomDataTable } from '@/components/custom-data-table';
import { batchColumns } from '@/data/columns/batches';
import { ProductBatch } from '@/types/primitives/ProductBatch';
import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
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

export default async function WorkspaceBatchesPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId } = await params;
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
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
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
