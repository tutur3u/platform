import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';

export default async function InventoryProductsStatistics({
  wsId,
}: {
  wsId: string;
}) {
  const supabase = await createClient();
  const t = await getTranslations();

  const enabled = true;

  const { data: inventoryProducts } = enabled
    ? await supabase.rpc('get_inventory_products_count', {
        ws_id: wsId,
      })
    : { data: 0 };

  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  if (!enabled || !containsPermission('view_inventory')) return null;

  return (
    <StatisticCard
      title={t('inventory-overview.products-with-prices')}
      value={inventoryProducts}
      href={`/${wsId}/inventory/products`}
    />
  );
}
