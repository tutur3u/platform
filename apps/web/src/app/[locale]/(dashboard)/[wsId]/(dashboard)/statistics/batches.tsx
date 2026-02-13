import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';
import { notFound } from 'next/navigation';

export default async function BatchesStatistics({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const t = await getTranslations();

  const enabled = true;

  const { count: batches } = enabled
    ? await supabase
        .from('inventory_batches')
        .select('*, inventory_warehouses!inner(ws_id)', {
          count: 'exact',
          head: true,
        })
        .eq('inventory_warehouses.ws_id', wsId)
    : { count: 0 };

  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  if (!enabled || !containsPermission('view_inventory')) return null;

  return (
    <StatisticCard
      title={t('workspace-inventory-tabs.batches')}
      value={batches}
      href={`/${wsId}/inventory/batches`}
    />
  );
}
