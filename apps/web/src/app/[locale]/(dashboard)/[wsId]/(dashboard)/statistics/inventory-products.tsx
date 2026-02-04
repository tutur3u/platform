import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
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

  const { containsPermission } = await getPermissions({
    wsId,
  });

  if (!enabled || !containsPermission('view_inventory')) return null;

  return (
    <StatisticCard
      title={t('inventory-overview.products-with-prices')}
      value={inventoryProducts}
      href={`/${wsId}/inventory/products`}
    />
  );
}
