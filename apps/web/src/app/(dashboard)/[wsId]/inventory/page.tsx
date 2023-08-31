import useTranslation from 'next-translate/useTranslation';
import StatisticCard from '@/components/cards/StatisticCard';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

interface Props {
  params: {
    wsId: string;
  };
}

export default async function InventoryPage({ params: { wsId } }: Props) {
  const supabase = createServerComponentClient({ cookies });
  const { t } = useTranslation('inventory-tabs');

  const { data: workspaceProducts } = await supabase.rpc(
    'get_workspace_products_count',
    {
      ws_id: wsId,
    }
  );

  const { data: inventoryProducts } = await supabase.rpc(
    'get_inventory_products_count',
    {
      ws_id: wsId,
    }
  );

  const { count: categories } = await supabase
    .from('product_categories')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const { count: batches } = await supabase
    .from('inventory_batches')
    .select('*, inventory_warehouses!inner(ws_id)', {
      count: 'exact',
      head: true,
    })
    .eq('inventory_warehouses.ws_id', wsId);

  const { count: warehouses } = await supabase
    .from('inventory_warehouses')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const { count: units } = await supabase
    .from('inventory_units')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const { count: suppliers } = await supabase
    .from('inventory_suppliers')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  return (
    <div className="grid flex-col gap-4 md:grid-cols-2 xl:grid-cols-4">
      {/* <Link
        href="/warehouse/attention"
        className="rounded bg-yellow-300/10 transition duration-300 hover:-translate-y-1 hover:bg-yellow-300/20 lg:col-span-2"
      >
        <div className="p-2 text-center text-xl font-semibold text-yellow-300">
          Sản phẩm gần hết hàng
        </div>
        <div className="m-4 mt-0 flex items-center justify-center rounded border border-yellow-300/20 bg-yellow-300/20 p-4 font-semibold text-yellow-300">
          {true ? `${0} sản phẩm` : 'Đang tải'}
        </div>
      </Link>

      <Link
        href="/warehouse/attention"
        className="rounded bg-red-300/10 transition duration-300 hover:-translate-y-1 hover:bg-red-300/20 lg:col-span-2"
      >
        <div className="p-2 text-center text-xl font-semibold text-red-300">
          Sản phẩm gần hết hạn sử dụng
        </div>
        <div className="m-4 mt-0 flex items-center justify-center rounded border border-red-300/20 bg-red-300/20 p-4 font-semibold text-red-300">
          {true ? `${0} sản phẩm` : 'Đang tải'}
        </div>
      </Link>

      <Separator className="col-span-full" /> */}

      <StatisticCard
        title={t('products')}
        color="blue"
        value={workspaceProducts}
        href={`/${wsId}/inventory/products`}
        className="md:col-span-2"
      />

      <StatisticCard
        title={t('inventory-overview:products-with-prices')}
        value={inventoryProducts}
        href={`/${wsId}/inventory/products`}
      />

      <StatisticCard
        title={t('product-categories')}
        value={categories}
        href={`/${wsId}/inventory/categories`}
      />

      <StatisticCard
        title={t('batches')}
        value={batches}
        href={`/${wsId}/inventory/batches`}
      />

      <StatisticCard
        title={t('warehouses')}
        value={warehouses}
        href={`/${wsId}/inventory/warehouses`}
      />

      <StatisticCard
        title={t('units')}
        value={units}
        href={`/${wsId}/inventory/units`}
      />

      <StatisticCard
        title={t('suppliers')}
        value={suppliers}
        href={`/${wsId}/inventory/suppliers`}
      />
    </div>
  );
}
