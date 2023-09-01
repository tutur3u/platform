import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Divider, TextInput, Textarea } from '@mantine/core';
import CategorySelector from '../../../../../../components/selectors/CategorySelector';
import { Product } from '../../../../../../types/primitives/Product';
import { useRouter } from 'next/router';
import { openModal } from '@mantine/modals';
import ProductEditModal from '../../../../../../components/loaders/products/ProductEditModal';
import ProductDeleteModal from '../../../../../../components/loaders/products/ProductDeleteModal';
import { useSegments } from '../../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../../hooks/useWorkspaces';
import { ProductWarehouse } from '../../../../../../types/primitives/ProductWarehouse';
import WarehouseProductsInput from '../../../../../../components/inputs/WarehouseProductsInput';
import { TrashIcon } from '@heroicons/react/24/solid';

export default function ProductOriginPage() {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const router = useRouter();
  const { wsId, productId } = router.query;

  const productApiPath =
    wsId && productId
      ? `/api/workspaces/${wsId}/inventory/products/${productId}`
      : null;

  const warehousesApiPath =
    wsId && productId ? `/api/workspaces/${wsId}/inventory/warehouses` : null;

  const { data: product } = useSWR<Product>(productApiPath);
  const { data: warehouses } = useSWR<ProductWarehouse[]>(warehousesApiPath);

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
              content: 'Sản phẩm',
              href: `/${ws.id}/inventory/products`,
            },
            {
              content: product?.name || 'Không có tên',
              href: `/${ws.id}/inventory/products/${productId}`,
            },
            {
              content: 'Nguồn gốc',
              href: `/${ws.id}/inventory/products/${productId}/origin`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, product, productId, setRootSegment]);

  const [categoryId, setCategoryId] = useState('');

  const [name, setName] = useState<string>('');
  const [manufacturer, setManufacturer] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [usage, setUsage] = useState<string>('');

  useEffect(() => {
    if (product) {
      setCategoryId(product?.category_id || '');
      setName(product?.name || '');
      setManufacturer(product?.manufacturer || '');
      setDescription(product?.description || '');
      setUsage(product?.usage || '');
    }
  }, [product]);

  const hasData = () => !!product;

  const hasRequiredFields = () =>
    name.length > 0 && categoryId.length > 0 && hasData();

  const showEditModal = () => {
    if (!product) return;
    if (typeof productId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">Cập nhật sản phẩm</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <ProductEditModal
          wsId={ws.id}
          oldProduct={product}
          product={{
            id: productId,
            category_id: categoryId,
            name,
            manufacturer,
            description,
            usage,
          }}
        />
      ),
    });
  };

  const showDeleteModal = () => {
    if (!product) return;
    if (typeof productId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">Xóa sản phẩm</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: <ProductDeleteModal wsId={ws.id} productId={productId} />,
    });
  };

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid gap-x-8 gap-y-4 xl:grid-cols-4 xl:gap-x-16">
        <div className="grid h-fit gap-x-4 gap-y-2">
          <div className="col-span-full">
            <div className="text-2xl font-semibold">Thông tin cơ bản</div>
            <Divider className="my-2" variant="dashed" />
          </div>

          <TextInput
            label="Tên sản phẩm"
            placeholder='Ví dụ: "Paracetamol 500mg"'
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
            disabled={!product}
          />
          <CategorySelector
            categoryId={categoryId}
            setCategoryId={setCategoryId}
            required
          />

          <TextInput
            label="Đơn vị sản xuất"
            placeholder='Ví dụ: "Công ty TNHH ABC"'
            value={manufacturer}
            onChange={(e) => setManufacturer(e.currentTarget.value)}
            disabled={!product}
          />

          <Textarea
            label="Mô tả"
            placeholder="Giới thiệu sản phẩm, đặc điểm nổi bật, ..."
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            minRows={5}
            disabled={!product}
          />

          <Textarea
            label="Cách dùng"
            placeholder="Hướng dẫn cách sử dụng sản phẩm"
            value={usage}
            onChange={(e) => setUsage(e.currentTarget.value)}
            minRows={5}
            disabled={!product}
          />

          <div className="flex gap-2">
            <button
              className={`w-fit rounded border border-red-300/10 bg-red-300/10 px-4 py-2 font-semibold text-red-300 transition ${
                product
                  ? 'hover:bg-red-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={product ? showDeleteModal : undefined}
            >
              <TrashIcon className="h-4 w-4" />
            </button>

            <button
              className={`w-full rounded border border-green-300/10 bg-green-300/10 px-4 py-2 font-semibold text-green-300 transition ${
                hasRequiredFields()
                  ? 'hover:bg-green-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={hasRequiredFields() ? showEditModal : undefined}
            >
              Lưu thay đổi
            </button>
          </div>
        </div>

        <div className="grid h-fit gap-4 xl:col-span-3">
          <div className="col-span-full">
            <div className="text-2xl font-semibold">Đơn giá</div>
            <Divider className="mb-4 mt-2" variant="dashed" />
          </div>

          {ws &&
            product &&
            warehouses &&
            warehouses.map((w) => (
              <WarehouseProductsInput
                key={w.id}
                wsId={ws.id}
                productId={product.id}
                warehouse={w}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
