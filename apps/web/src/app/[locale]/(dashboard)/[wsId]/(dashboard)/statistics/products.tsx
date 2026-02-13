import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';
import { notFound } from 'next/navigation';

export default async function ProductsStatistics({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const t = await getTranslations();

  const permissions = await getPermissions({
    wsId,
  });
if (!permissions) notFound();
const { withoutPermission } = permissions;

  if (withoutPermission('view_inventory')) return null;

  const { data: workspaceProducts } = await supabase.rpc(
    'get_workspace_products_count',
    {
      ws_id: wsId,
    }
  );

  return (
    <StatisticCard
      title={t('workspace-inventory-tabs.products')}
      value={workspaceProducts}
      href={`/${wsId}/inventory/products`}
    />
  );
}
