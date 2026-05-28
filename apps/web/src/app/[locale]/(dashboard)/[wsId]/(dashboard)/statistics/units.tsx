import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';
import { serverLogger } from '@/lib/infrastructure/log-drain';

export default async function UnitsStatistics({ wsId }: { wsId: string }) {
  const supabase = (await createAdminClient()).schema('private');
  const t = await getTranslations();

  const enabled = true;
  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  if (!enabled || !containsPermission('view_inventory')) return null;

  const { count: units, error } = enabled
    ? await supabase
        .from('inventory_units')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0, error: null };

  if (error) {
    serverLogger.error('Error fetching inventory units count', error);
  }

  return (
    <StatisticCard
      title={t('workspace-inventory-tabs.units')}
      value={units ?? 0}
      href={`/${wsId}/inventory/units`}
    />
  );
}
