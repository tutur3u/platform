import { getPromotionColumns } from './columns';
import { PromotionForm } from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { getWorkspaceUser } from '@/lib/workspace-helper';
import { createClient } from '@tuturuuu/supabase/next/server';
import { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getCurrentUser } from '@tuturuuu/utils/server/user-helper';
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

export default async function WorkspacePromotionsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId } = await params;
  const { data, count } = await getData(wsId, await searchParams);

  const user = await getCurrentUser(true);
  const wsUser = await getWorkspaceUser(wsId, user?.id!);

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
    <>
      <FeatureSummary
        pluralTitle={t('ws-inventory-promotions.plural')}
        singularTitle={t('ws-inventory-promotions.singular')}
        description={t('ws-inventory-promotions.description')}
        createTitle={t('ws-inventory-promotions.create')}
        createDescription={t('ws-inventory-promotions.create_description')}
        form={<PromotionForm wsId={wsId} wsUserId={wsUser.virtual_user_id} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={promotions}
        columnGenerator={getPromotionColumns}
        namespace="promotion-data-table"
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
