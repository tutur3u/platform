import StatisticCard from '@/components/cards/StatisticCard';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

export default async function ProductCategoriesStatistics({
  wsId,
}: {
  wsId: string;
}) {
  const supabase = await createClient();
  const t = await getTranslations();

  const enabled = true;

  const { count: categories } = enabled
    ? await supabase
        .from('product_categories')
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
      title={t('workspace-inventory-tabs.categories')}
      value={categories}
      href={`/${wsId}/inventory/categories`}
    />
  );
}
