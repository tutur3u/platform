'use client';

import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';
import StatisticCard from '@/components/cards/StatisticCard';
import Link from 'next/link';
import { Divider } from '@mantine/core';

interface Props {
  params: {
    wsId: string;
  };
}

export default function InventoryPage({ params: { wsId } }: Props) {
  const { t } = useTranslation('inventory-tabs');

  const productsCountApi = wsId
    ? `/api/workspaces/${wsId}/inventory/products/count`
    : null;

  const categoriesCountApi = wsId
    ? `/api/workspaces/${wsId}/inventory/categories/count`
    : null;

  const batchesCountApi = wsId
    ? `/api/workspaces/${wsId}/inventory/batches/count`
    : null;

  const warehousesCountApi = wsId
    ? `/api/workspaces/${wsId}/inventory/warehouses/count`
    : null;

  const unitsCountApi = wsId
    ? `/api/workspaces/${wsId}/inventory/units/count`
    : null;

  const suppliersCountApi = wsId
    ? `/api/workspaces/${wsId}/inventory/suppliers/count`
    : null;

  const { data: products, error: productsError } = useSWR<{
    ws: number;
    inventory: number;
  }>(productsCountApi);

  const { data: categories, error: categoriesError } =
    useSWR<number>(categoriesCountApi);

  const { data: batches, error: batchesError } =
    useSWR<number>(batchesCountApi);

  const { data: warehouses, error: warehousesError } =
    useSWR<number>(warehousesCountApi);

  const { data: units, error: unitsError } = useSWR<number>(unitsCountApi);

  const { data: suppliers, error: suppliersError } =
    useSWR<number>(suppliersCountApi);

  const isProductsLoading = products === undefined && !productsError;
  const isCategoriesLoading = categories === undefined && !categoriesError;
  const isBatchesLoading = batches === undefined && !batchesError;
  const isWarehousesLoading = warehouses === undefined && !warehousesError;
  const isUnitsLoading = units === undefined && !unitsError;
  const isSuppliersLoading = suppliers === undefined && !suppliersError;

  return (
    <div className="grid flex-col gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Link
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

      <Divider className="col-span-full" variant="dashed" />

      <StatisticCard
        title={t('products')}
        color="blue"
        value={products?.ws}
        href={`/${wsId}/inventory/products`}
        loading={isProductsLoading}
        className="md:col-span-2"
      />

      <StatisticCard
        title={t('inventory-overview:products-with-prices')}
        value={products?.inventory}
        href={`/${wsId}/inventory/products`}
        loading={isProductsLoading}
      />

      <StatisticCard
        title={t('product-categories')}
        value={categories}
        href={`/${wsId}/inventory/categories`}
        loading={isCategoriesLoading}
      />

      <StatisticCard
        title={t('batches')}
        value={batches}
        href={`/${wsId}/inventory/batches`}
        loading={isBatchesLoading}
      />

      <StatisticCard
        title={t('warehouses')}
        value={warehouses}
        href={`/${wsId}/inventory/warehouses`}
        loading={isWarehousesLoading}
      />

      <StatisticCard
        title={t('units')}
        value={units}
        href={`/${wsId}/inventory/units`}
        loading={isUnitsLoading}
      />

      <StatisticCard
        title={t('suppliers')}
        value={suppliers}
        href={`/${wsId}/inventory/suppliers`}
        loading={isSuppliersLoading}
      />
    </div>
  );
}
