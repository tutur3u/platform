import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';

export default async function SuppliersStatistics({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const t = await getTranslations();

  const { withoutPermission } = await getPermissions({
    wsId,
  });
  if (withoutPermission('view_inventory')) return null;

  const { count: suppliers } = await supabase
    .from('inventory_suppliers')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  return (
    <StatisticCard
      title={t('workspace-inventory-tabs.suppliers')}
      value={suppliers}
      href={`/${wsId}/inventory/suppliers`}
    />
  );
}
