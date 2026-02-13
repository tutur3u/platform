import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';
import { notFound } from 'next/navigation';

export default async function SuppliersStatistics({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const t = await getTranslations();

  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;
  if (withoutPermission('view_inventory')) return null;

  const { count: suppliers, error } = await supabase
    .from('inventory_suppliers')
    .select('id', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  if (error) {
    console.error('Error fetching workspace suppliers:', error);
    return null;
  }

  return (
    <StatisticCard
      title={t('workspace-inventory-tabs.suppliers')}
      value={suppliers ?? 0}
      href={`/${wsId}/inventory/suppliers`}
    />
  );
}
