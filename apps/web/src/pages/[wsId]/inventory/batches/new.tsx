import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Divider, NumberInput } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import WarehouseSelector from '../../../../components/selectors/WarehouseSelector';
import { Product } from '../../../../types/primitives/Product';
import { TrashIcon } from '@heroicons/react/24/solid';
import SupplierSelector from '../../../../components/selectors/SupplierSelector';
import { openModal } from '@mantine/modals';
import BatchCreateModal from '../../../../components/loaders/batches/BatchCreateModal';
import ProductUnitSelector from '../../../../components/selectors/ProductUnitSelector';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import { useSegments } from '../../../../hooks/useSegments';

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

  const [warehouseId, setWarehouseId] = useLocalStorage({
    key: 'warehouse-id',
    defaultValue: '',
  });

  const [supplierId, setSupplierId] = useLocalStorage({
    key: 'supplier-id',
    defaultValue: '',
  });

  const [price, setPrice] = useState<number>();

  const [products, setProducts] = useState<Product[]>([]);

  const allProductsValid = () =>
    products.every(
      (product) =>
        (product?.id?.length || 0) > 0 &&
        (product?.unit_id?.length || 0) > 0 &&
        product?.amount &&
        product?.price !== undefined
    );

  const hasRequiredFields = () =>
    warehouseId && supplierId && products.length > 0 && allProductsValid();

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
            price,
            warehouse_id: warehouseId,
            supplier_id: supplierId,
          }}
          products={products}
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

  const updateProductId = (index: number, newId: string, id?: string) => {
    if (newId === id) return;

    const [newProductId, newUnitId] = newId.split('::');

    if (
      products.some(
        (product) =>
          product.id === newProductId && (product?.unit_id || '') === newUnitId
      )
    )
      return;

    // If the id is provided, it means that the user is changing the id
    // of an existing product. In this case, we need to find the index of the
    // product with the old id and replace it with the new one.
    if (id) {
      const oldIndex = products.findIndex(
        (product) =>
          product.id === newProductId && (product?.unit_id || '') === newUnitId
      );
      if (oldIndex === -1) return;

      setProducts((products) => {
        const newProducts = [...products];
        newProducts[oldIndex].id = newProductId;
        newProducts[oldIndex].unit_id = newUnitId;
        return newProducts;
      });
    } else {
      setProducts((products) => {
        const newProducts = [...products];
        newProducts[index].id = newProductId;
        newProducts[index].unit_id = newUnitId;
        return newProducts;
      });
    }
  };

  const updatePrice = (id: string, price: number) => {
    const [productId, unitId] = id.split('::');

    const index = products.findIndex(
      (product) => product.id === productId && product.unit_id === unitId
    );

    if (index === -1) return;

    setProducts((products) => {
      const newProducts = [...products];
      newProducts[index].price = price;
      return newProducts;
    });
  };

  const updateAmount = (id: string, amount: number) => {
    const [productId, unitId] = id.split('::');

    const index = products.findIndex(
      (product) => product.id === productId && product.unit_id === unitId
    );

    if (index === -1) return;

    setProducts((products) => {
      const newProducts = [...products];
      newProducts[index].amount = amount;
      return newProducts;
    });
  };

  const getUniqueProductIds = () => {
    const unitIds = new Set<string>();
    products.forEach((price) => unitIds.add(price.id));
    return Array.from(unitIds);
  };

  const removePrice = (index: number) =>
    setProducts((products) => products.filter((_, i) => i !== index));

  return (
    <>
      <HeaderX label="Sản phẩm – Kho hàng" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-8">
        <div className="grid gap-x-8 gap-y-4 xl:grid-cols-2 xl:gap-x-16">
          <div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
            <WarehouseSelector
              warehouseId={warehouseId}
              setWarehouseId={setWarehouseId}
              required
            />
          </div>
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

            <SupplierSelector
              supplierId={supplierId}
              setSupplierId={setSupplierId}
              required
            />

            <NumberInput
              label="Giá nhập lô"
              placeholder="Nhập giá lô hàng"
              value={price}
              onChange={(val) => setPrice(Number(val))}
              className="w-full"
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
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
            <div className="col-span-full">
              <div className="text-2xl font-semibold">Sản phẩm</div>
              <Divider className="mb-4 mt-2" variant="dashed" />

              <button
                className="rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition hover:bg-blue-300/20"
                onClick={addEmptyProduct}
              >
                + Thêm sản phẩm
              </button>
            </div>

            {products.map((p, idx) => (
              <div
                key={p.id + idx}
                className="grid items-end gap-2 xl:grid-cols-2"
              >
                <div className="flex w-full items-end gap-2">
                  <ProductUnitSelector
                    id={`${p.id}::${p.unit_id}`}
                    setId={(id) =>
                      updateProductId(
                        idx,
                        id,
                        p.id && p.unit_id ? `${p.id}::${p.unit_id}` : undefined
                      )
                    }
                    blacklist={getUniqueProductIds()}
                    className="w-full"
                  />
                  <button
                    className="h-fit rounded border border-red-300/10 bg-red-300/10 px-1 py-1.5 font-semibold text-red-300 transition hover:bg-red-300/20 md:px-4 xl:hidden"
                    onClick={() => removePrice(idx)}
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex w-full items-end gap-2">
                  <NumberInput
                    label="Số lượng"
                    placeholder="Số lượng nhập"
                    value={p.amount}
                    onChange={(e) =>
                      p.id && p.unit_id
                        ? updateAmount(`${p.id}::${p.unit_id}`, Number(e))
                        : undefined
                    }
                    className="w-full"
                    classNames={{
                      input: 'bg-white/5 border-zinc-300/20 font-semibold',
                    }}
                    min={0}
                    parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
                    formatter={(value) =>
                      !Number.isNaN(parseFloat(value || ''))
                        ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                        : ''
                    }
                    disabled={!p.id || !p.unit_id}
                  />
                  <NumberInput
                    label="Giá nhập"
                    placeholder="Giá nhập sản phẩm"
                    value={p.price}
                    onChange={(e) =>
                      p.id && p.unit_id
                        ? updatePrice(`${p.id}::${p.unit_id}`, Number(e))
                        : undefined
                    }
                    className="w-full"
                    classNames={{
                      input: 'bg-white/5 border-zinc-300/20 font-semibold',
                    }}
                    min={0}
                    parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
                    formatter={(value) =>
                      !Number.isNaN(parseFloat(value || ''))
                        ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                        : ''
                    }
                    disabled={!p.id || !p.unit_id}
                  />
                  <button
                    className="pointer-events-none h-fit rounded border border-red-300/10 bg-red-300/10 px-1 py-1.5 font-semibold text-red-300 opacity-0 transition hover:bg-red-300/20 md:px-4 xl:pointer-events-auto xl:opacity-100"
                    onClick={() => removePrice(idx)}
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
                {idx !== products.length - 1 && (
                  <Divider className="mt-2 w-full xl:hidden" />
                )}
              </div>
            ))}
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
