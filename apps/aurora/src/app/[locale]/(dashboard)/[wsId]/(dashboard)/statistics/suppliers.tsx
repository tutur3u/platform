import StatisticCard from '@/components/cards/StatisticCard';
import { getPermissions } from '@/lib/workspace-helper';
import { createClient } from '@/utils/supabase/server';
import { getTranslations } from 'next-intl/server';

export default async function SuppliersStatistics({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const t = await getTranslations();

  const enabled = true;

  const { count: suppliers } = enabled
    ? await supabase
        .from('inventory_suppliers')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  const { permissions } = await getPermissions({
    wsId,
  });

  if (!enabled || !permissions.includes('manage_inventory')) return null;

  return (
    <StatisticCard
      title={t('workspace-inventory-tabs.suppliers')}
      value={suppliers}
      href={`/${wsId}/inventory/suppliers`}
    />
  );
}
