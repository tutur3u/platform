import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';
import { serverLogger } from '@/lib/infrastructure/log-drain';

export default async function InventoryProductsStatistics({
  wsId,
}: {
  wsId: string;
}) {
  const supabase = await createAdminClient();
  const t = await getTranslations();

  const enabled = true;

  const { data: inventoryProducts, error } = enabled
    ? await supabase.rpc('get_inventory_products_count', {
        ws_id: wsId,
      })
    : { data: 0, error: null };

  if (error) {
    serverLogger.error('Error fetching inventory products count', error);
  }

  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  if (!enabled || !containsPermission('view_inventory')) return null;

  return (
    <StatisticCard
      title={t('inventory-overview.products-with-prices')}
      value={Number(inventoryProducts ?? 0)}
      href={`/${wsId}/inventory/products`}
    />
  );
}
