import StatisticCard from '@/components/cards/StatisticCard';
import { getPermissions } from '@/lib/workspace-helper';
import { createClient } from '@/utils/supabase/server';
import { getTranslations } from 'next-intl/server';

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

  const { permissions } = await getPermissions({
    wsId,
  });

  if (!enabled || !permissions.includes('manage_inventory')) return null;

  return (
    <StatisticCard
      title={t('inventory-overview.products-with-prices')}
      value={inventoryProducts}
      href={`/${wsId}/inventory/products`}
    />
  );
}
