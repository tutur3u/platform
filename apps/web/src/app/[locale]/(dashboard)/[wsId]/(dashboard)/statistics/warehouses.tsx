import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';

export default async function WarehousesStatistics({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const t = await getTranslations();

  const enabled = true;
  const { permissions } = await getPermissions({
    wsId,
  });

  if (!enabled || !permissions.includes('view_inventory')) return null;

  const { count: warehouses } = enabled
    ? await supabase
        .from('inventory_warehouses')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  return (
    <StatisticCard
      title={t('workspace-inventory-tabs.warehouses')}
      value={warehouses}
      href={`/${wsId}/inventory/warehouses`}
    />
  );
}
