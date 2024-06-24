import StatisticCard from '@/components/cards/StatisticCard';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { createClient } from '@/utils/supabase/server';
import useTranslation from 'next-translate/useTranslation';

export default async function InventoryProductsStatistics({
  wsId,
  redirect = false,
}: {
  wsId: string;
  redirect?: boolean;
}) {
  const supabase = createClient();
  const { t } = useTranslation();

  const enabled = await verifyHasSecrets(
    wsId,
    ['ENABLE_INVENTORY'],
    redirect ? `/${wsId}` : undefined
  );

  const { data: inventoryProducts } = enabled
    ? await supabase.rpc('get_inventory_products_count', {
        ws_id: wsId,
      })
    : { data: 0 };

  if (!enabled) return null;

  return (
    <StatisticCard
      title={t('inventory-overview:products-with-prices')}
      value={inventoryProducts}
      href={`/${wsId}/inventory/products`}
    />
  );
}
