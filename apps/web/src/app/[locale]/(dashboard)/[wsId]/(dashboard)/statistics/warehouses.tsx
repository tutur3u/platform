import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';
import { serverLogger } from '@/lib/infrastructure/log-drain';

export default async function WarehousesStatistics({ wsId }: { wsId: string }) {
  const supabase = (await createAdminClient()).schema('private');
  const t = await getTranslations();

  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;

  if (withoutPermission('view_inventory')) return null;

  const { count: warehouses, error } = await supabase
    .from('inventory_warehouses')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  if (error) {
    serverLogger.error('Error fetching inventory warehouses count', error);
  }

  return (
    <StatisticCard
      title={t('workspace-inventory-tabs.warehouses')}
      value={warehouses ?? 0}
      href={`/${wsId}/inventory/warehouses`}
    />
  );
}
