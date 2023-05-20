import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Divider, NumberInput } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import WarehouseSelector from '../../../../components/selectors/WarehouseSelector';
import { Product } from '../../../../types/primitives/Product';
import SupplierSelector from '../../../../components/selectors/SupplierSelector';
import { openModal } from '@mantine/modals';
import BatchCreateModal from '../../../../components/loaders/batches/BatchCreateModal';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import { useSegments } from '../../../../hooks/useSegments';
import BatchProductInput from '../../../../components/inputs/BatchProductInput';

export const getServerSideProps = enforceHasWorkspaces;

const NewBatchPage: PageWithLayoutProps = () => {
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
            { content: 'Kho hàng', href: `/${ws.id}/inventory` },
            {
              content: 'Lô hàng',
              href: `/${ws.id}/inventory/batches`,
            },
            { content: 'Tạo mới', href: `/${ws.id}/inventory/batches/new` },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [products, setProducts] = useState<Product[]>([]);
  const [price, setPrice] = useState<number | ''>();

  const [warehouseId, setWarehouseId] = useLocalStorage({
    key: 'warehouse-id',
    defaultValue: '',
  });

  useEffect(() => {
    if (warehouseId) setProducts([]);
  }, [warehouseId]);

  const [supplierId, setSupplierId] = useLocalStorage({
    key: 'supplier-id',
    defaultValue: '',
  });

  const allProductsValid = () =>
    products.every(
      (product) =>
        (product?.id?.length || 0) > 0 &&
        (product?.unit_id?.length || 0) > 0 &&
        product?.amount &&
        product?.price !== undefined
    );

  const hasRequiredFields = () =>
    price != null &&
    price != '' &&
    warehouseId &&
    supplierId &&
    products.length > 0 &&
    allProductsValid();

  const showLoaderModal = () => {
    if (!ws?.id || !hasRequiredFields()) return;

    openModal({
      title: <div className="font-semibold">Tạo lô hàng mới</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <BatchCreateModal
          wsId={ws.id}
          batch={{
            price: Number(price),
            warehouse_id: warehouseId,
            supplier_id: supplierId,
          }}
          products={
            products.map((product) => ({
              ...product,
              warehouse_id: warehouseId,
            })) || []
          }
        />
      ),
    });
  };

  const addEmptyProduct = () => {
    setProducts((products) => [
      ...products,
      {
        id: '',
      },
    ]);
  };

  const updateProduct = (index: number, product: Product) =>
    setProducts((products) =>
      products.map((p, i) => (i === index ? product : p))
    );

  const getUniqueIds = () => {
    const ids = new Set<string>();

    products.forEach((product) => {
      if (product.id && product.unit_id)
        ids.add(`${product.id}::${product.unit_id}`);
    });

    return Array.from(ids);
  };

  const removePrice = (index: number) =>
    setProducts((products) => products.filter((_, i) => i !== index));

  return (
    <>
      <HeaderX label="Sản phẩm – Kho hàng" />
      <div className="mt-2 flex min-h-full w-full flex-col ">
        <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
          <div className="flex items-end justify-end">
            <button
              className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
                hasRequiredFields()
                  ? 'hover:bg-blue-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={hasRequiredFields() ? showLoaderModal : undefined}
            >
              Tạo mới
            </button>
          </div>
        </div>

        <Divider className="my-4" />
        <div className="grid gap-x-8 gap-y-4 lg:grid-cols-4 xl:gap-x-16">
          <div className="grid h-fit gap-2">
            <div className="col-span-full">
              <div className="text-2xl font-semibold">Thông tin cơ bản</div>
              <Divider className="my-2" variant="dashed" />
            </div>

            <WarehouseSelector
              warehouseId={warehouseId}
              setWarehouseId={setWarehouseId}
              required
            />

            <SupplierSelector
              supplierId={supplierId}
              setSupplierId={setSupplierId}
              required
            />

            <NumberInput
              label="Giá nhập lô"
              placeholder="Nhập giá lô hàng"
              value={price}
              onChange={setPrice}
              className="w-full"
              min={0}
              parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
              formatter={(value) =>
                !Number.isNaN(parseFloat(value || ''))
                  ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                  : ''
              }
            />
          </div>

          <div className="grid h-fit gap-x-4 gap-y-2 lg:col-span-3">
            {warehouseId ? (
              <>
                <div className="col-span-full">
                  <div className="text-2xl font-semibold">Sản phẩm</div>
                  <Divider className="mb-4 mt-2" variant="dashed" />

                  <button
                    className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
                    onClick={addEmptyProduct}
                  >
                    + Thêm sản phẩm
                  </button>
                </div>

                {products.map((p, idx) => (
                  <BatchProductInput
                    warehouseId={warehouseId}
                    key={p.id + idx}
                    product={p}
                    getUniqueUnitIds={getUniqueIds}
                    updateProduct={(product) => updateProduct(idx, product)}
                    removePrice={() => removePrice(idx)}
                    isLast={idx === products.length - 1}
                  />
                ))}
              </>
            ) : (
              <div className="col-span-full h-full w-full rounded border border-zinc-300/10 bg-zinc-800 p-4 text-center">
                Chọn kho chứa để thêm sản phẩm
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

NewBatchPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NewBatchPage;
