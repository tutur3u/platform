import { CustomDataTable } from '@/components/custom-data-table';
import { promotionColumns } from '@/data/columns/promotions';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { ProductPromotion } from '@/types/primitives/ProductPromotion';
import { createClient } from '@/utils/supabase/server';

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

export default async function WorkspacePromotionsPage({
  params: { wsId },
  searchParams,
}: Props) {
  await verifyHasSecrets(wsId, ['ENABLE_INVENTORY'], `/${wsId}`);
  const { data, count } = await getData(wsId, searchParams);

  const promotions = data.map(({ value, use_ratio, ...rest }) => ({
    ...rest,
    value: use_ratio
      ? `${value}%`
      : Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: 'VND',
        }).format(parseInt(value.toString())),
    use_ratio,
  }));

  return (
    <CustomDataTable
      data={promotions}
      columnGenerator={promotionColumns}
      namespace="promotion-data-table"
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
  const supabase = createClient();

  const queryBuilder = supabase
    .from('workspace_promotions')
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

  return { data, count } as { data: ProductPromotion[]; count: number };
}
