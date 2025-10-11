import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';

export default async function PromotionsStatistics({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const t = await getTranslations();

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('view_inventory')) return null;
  const { count: promotions, error } = await supabase
    .from('workspace_promotions')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  if (error) {
    console.error('Error fetching workspace promotions:', error);
    return null;
  }

  return (
    <StatisticCard
      title={t('workspace-inventory-tabs.promotions')}
      value={promotions}
      href={`/${wsId}/inventory/promotions`}
    />
  );
}
