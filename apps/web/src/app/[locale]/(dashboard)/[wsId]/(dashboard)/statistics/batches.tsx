import StatisticCard from '@/components/cards/StatisticCard';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { createClient } from '@/utils/supabase/server';
import { getTranslations } from 'next-intl/server';

export default async function BatchesStatistics({
  wsId,
  redirect = false,
}: {
  wsId: string;
  redirect?: boolean;
}) {
  const supabase = createClient();
  const t = await getTranslations();

  const enabled = await verifyHasSecrets(
    wsId,
    ['ENABLE_INVENTORY'],
    redirect ? `/${wsId}` : undefined
  );

  const { count: batches } = enabled
    ? await supabase
        .from('inventory_batches')
        .select('*, inventory_warehouses!inner(ws_id)', {
          count: 'exact',
          head: true,
        })
        .eq('inventory_warehouses.ws_id', wsId)
    : { count: 0 };

  if (!enabled) return null;

  return (
    <StatisticCard
      title={t('workspace-inventory-tabs.batches')}
      value={batches}
      href={`/${wsId}/inventory/batches`}
    />
  );
}
