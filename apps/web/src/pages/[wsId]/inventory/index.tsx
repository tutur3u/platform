import { ReactElement, useEffect } from 'react';
import HeaderX from '../../../components/metadata/HeaderX';
import { useSegments } from '../../../hooks/useSegments';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import StatisticCard from '../../../components/cards/StatisticCard';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';

export const getServerSideProps = enforceHasWorkspaces;

const InventoryPage: PageWithLayoutProps = () => {
  const { t } = useTranslation('inventory-tabs');

  const inventoryLabel = t('sidebar-tabs:inventory');
  const overviewLabel = t('overview');

  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: inventoryLabel, href: `/${ws.id}/inventory` },
            {
              content: overviewLabel,
              href: `/${ws.id}/inventory`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, inventoryLabel, overviewLabel, setRootSegment]);

  const productsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/inventory/products/count`
    : null;

  const categoriesCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/inventory/categories/count`
    : null;

  const batchesCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/inventory/batches/count`
    : null;

  const warehousesCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/inventory/warehouses/count`
    : null;

  const unitsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/inventory/units/count`
    : null;

  const suppliersCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/inventory/suppliers/count`
    : null;

  const { data: products } = useSWR<{
    ws: number;
    inventory: number;
  }>(productsCountApi);

  const { data: categories } = useSWR<number>(categoriesCountApi);
  const { data: batches } = useSWR<number>(batchesCountApi);
  const { data: warehouses } = useSWR<number>(warehousesCountApi);
  const { data: units } = useSWR<number>(unitsCountApi);
  const { data: suppliers } = useSWR<number>(suppliersCountApi);

  return (
    <>
      <HeaderX label={`${overviewLabel} – ${inventoryLabel}`} />
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

        <Divider className="col-span-full" variant="dashed" /> */}

        <StatisticCard
          title={t('products')}
          color="blue"
          value={products?.ws}
          href={`/${ws?.id}/inventory/products`}
          className="md:col-span-2"
        />

        <StatisticCard
          title={t('inventory-overview:products-with-prices')}
          value={products?.inventory}
          href={`/${ws?.id}/inventory/products`}
        />

        <StatisticCard
          title={t('product-categories')}
          value={categories}
          href={`/${ws?.id}/inventory/categories`}
        />

        <StatisticCard
          title={t('batches')}
          value={batches}
          href={`/${ws?.id}/inventory/batches`}
        />

        <StatisticCard
          title={t('warehouses')}
          value={warehouses}
          href={`/${ws?.id}/inventory/warehouses`}
        />

        <StatisticCard
          title={t('units')}
          value={units}
          href={`/${ws?.id}/inventory/units`}
        />

        <StatisticCard
          title={t('suppliers')}
          value={suppliers}
          href={`/${ws?.id}/inventory/suppliers`}
        />
      </div>
    </>
  );
};

InventoryPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="inventory">{page}</NestedLayout>;
};

export default InventoryPage;
