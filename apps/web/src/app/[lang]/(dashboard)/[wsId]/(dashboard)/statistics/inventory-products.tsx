import StatisticCard from '@/components/cards/StatisticCard';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import useTranslation from 'next-translate/useTranslation';
import { cookies } from 'next/headers';

export default async function InventoryProductsStatistics({
  wsId,
  redirect = false,
}: {
  wsId: string;
  redirect?: boolean;
}) {
  const supabase = createServerComponentClient({ cookies });
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
