import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';

export default async function ProductsStatistics({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const t = await getTranslations();

  const enabled = true;

  const { data: workspaceProducts } = enabled
    ? await supabase.rpc('get_workspace_products_count', {
        ws_id: wsId,
      })
    : { data: 0 };

  const { permissions } = await getPermissions({
    wsId,
  });

  if (!enabled || !permissions.includes('manage_inventory')) return null;

  return (
    <StatisticCard
      title={t('workspace-inventory-tabs.products')}
      value={workspaceProducts}
      href={`/${wsId}/inventory/products`}
    />
  );
}
