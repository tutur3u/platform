import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';
import { serverLogger } from '@/lib/infrastructure/log-drain';

export default async function ProductsStatistics({ wsId }: { wsId: string }) {
  const supabase = await createAdminClient();
  const t = await getTranslations();

  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;

  if (withoutPermission('view_inventory')) return null;

  const { data: workspaceProducts, error } = await supabase.rpc(
    'get_workspace_products_count',
    {
      ws_id: wsId,
    }
  );

  if (error) {
    serverLogger.error('Error fetching workspace products count', error);
  }

  return (
    <StatisticCard
      title={t('workspace-inventory-tabs.products')}
      value={Number(workspaceProducts ?? 0)}
      href={`/${wsId}/inventory/products`}
    />
  );
}
