import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';
import { notFound } from 'next/navigation';

export default async function UnitsStatistics({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const t = await getTranslations();

  const enabled = true;
  const permissions = await getPermissions({
    wsId,
  });
if (!permissions) notFound();
const { containsPermission } = permissions;

  if (!enabled || !containsPermission('view_inventory')) return null;

  const { count: units } = enabled
    ? await supabase
        .from('inventory_units')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  return (
    <StatisticCard
      title={t('workspace-inventory-tabs.units')}
      value={units}
      href={`/${wsId}/inventory/units`}
    />
  );
}
