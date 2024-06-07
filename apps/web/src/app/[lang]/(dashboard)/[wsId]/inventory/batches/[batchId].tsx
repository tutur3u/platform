import BatchProductInput from '../../../../../../components/inputs/BatchProductInput';
import { useSegments } from '@/hooks/useSegments';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { Product } from '@/types/primitives/Product';
import { ProductBatch } from '@/types/primitives/ProductBatch';
import { Divider, NumberInput } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

export default function BatchDetailsPage() {
  const router = useRouter();

  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const { wsId, batchId } = router.query;

  const batchApiPath =
    wsId && batchId
      ? `/api/workspaces/${wsId}/inventory/batches/${batchId}`
      : null;

  const productsApiPath =
    wsId && batchId
      ? `/api/workspaces/${wsId}/inventory/batches/${batchId}/products`
      : null;

  const { data: batch } = useSWR<ProductBatch>(batchApiPath);
  const { data: batchProducts } = useSWR<Product[]>(productsApiPath);

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
            {
              content: batch?.id || 'Đang tải...',
              href: `/${ws.id}/inventory/batches/${batch?.id}`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, batch?.id, setRootSegment]);

  const [warehouseId, setWarehouseId] = useLocalStorage({
    key: 'warehouse-id',
    defaultValue: '',
  });

  const [supplierId, setSupplierId] = useLocalStorage({
    key: 'supplier-id',
    defaultValue: '',
  });

  const [price, setPrice] = useState<number | string>('');

  useEffect(() => {
    if (batch) {
      setWarehouseId(batch?.warehouse_id || '');
      setSupplierId(batch?.supplier_id || '');
      setPrice(batch?.price || 0);
    }
  }, [batch, setWarehouseId, setSupplierId, setPrice]);

  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (batchProducts) setProducts(batchProducts);
  }, [batchProducts]);

  const allProductsValid = () =>
    products.every(
      (product) =>
        product.id.length > 0 && product?.amount && product?.price !== undefined
    );

  const hasData = () => !!batch && !!batchProducts;

  const hasRequiredFields = () =>
    warehouseId.length > 0 &&
    supplierId.length > 0 &&
    hasData() &&
    allProductsValid();

  const removePrice = (index: number) => {
    setProducts((products) => products.filter((_, i) => i !== index));
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

  return (
    <div className="mt-2 flex min-h-full w-full flex-col">
      <div className="grid gap-x-8 gap-y-4">
        <div className="flex items-end justify-end gap-2">
          <button
            className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
              batch && batchProducts
                ? 'hover:bg-red-300/20'
                : 'cursor-not-allowed opacity-50'
            }`}
          >
            Xoá
          </button>

          <button
            className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
              hasRequiredFields()
                ? 'hover:bg-blue-300/20'
                : 'cursor-not-allowed opacity-50'
            }`}
          >
            Lưu thay đổi
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

          <NumberInput
            label="Giá nhập lô"
            placeholder="Nhập giá lô hàng"
            value={price}
            onChange={setPrice}
            className="w-full"
            min={0}
          />
        </div>

        <div className="grid h-fit gap-x-4 gap-y-2 lg:col-span-3">
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
        </div>
      </div>
    </div>
  );
}
