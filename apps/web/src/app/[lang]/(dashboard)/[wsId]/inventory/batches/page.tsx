import { DataTable } from '@/components/ui/custom/tables/data-table';
import { batchColumns } from '@/data/columns/batches';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { ProductBatch } from '@/types/primitives/ProductBatch';
import { Database } from '@/types/supabase';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

interface Props {
  params: {
    wsId: string;
  };
  searchParams: {
    q: string;
    page: string;
    pageSize: string;
  };
}

export default async function WorkspaceBatchesPage({
  params: { wsId },
  searchParams,
}: Props) {
  await verifyHasSecrets(wsId, ['ENABLE_INVENTORY'], `/${wsId}`);
  const { data, count } = await getData(wsId, searchParams);

  return (
    <DataTable
      data={data}
      columnGenerator={batchColumns}
      namespace="batch-data-table"
      count={count}
      defaultVisibility={{
        id: false,
        created_at: false,
      }}
    />
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
  const supabase = createServerComponentClient<Database>({ cookies });

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
