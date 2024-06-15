import StatisticCard from '@/components/cards/StatisticCard';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { createClient } from '@/utils/supabase/server';
import useTranslation from 'next-translate/useTranslation';

export default async function WarehousesStatistics({
  wsId,
  redirect = false,
}: {
  wsId: string;
  redirect?: boolean;
}) {
  const supabase = createClient();
  const { t } = useTranslation();

  const enabled = await verifyHasSecrets(
    wsId,
    ['ENABLE_INVENTORY'],
    redirect ? `/${wsId}` : undefined
  );

  const { count: warehouses } = enabled
    ? await supabase
        .from('inventory_warehouses')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  if (!enabled) return null;

  return (
    <StatisticCard
      title={t('workspace-inventory-tabs:warehouses')}
      value={warehouses}
      href={`/${wsId}/inventory/warehouses`}
    />
  );
}
