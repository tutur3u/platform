import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import useSWR from 'swr';
import { Divider, NumberInput, TextInput, Textarea } from '@mantine/core';
import CategorySelector from '../../../../../components/selectors/CategorySelector';
import { ProductPrice } from '../../../../../types/primitives/ProductPrice';
import UnitSelector from '../../../../../components/selectors/UnitSelector';
import { TrashIcon } from '@heroicons/react/24/solid';
import { Product } from '../../../../../types/primitives/Product';
import { useRouter } from 'next/router';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';

export const getServerSideProps = enforceHasWorkspaces;

const ProductOriginPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const router = useRouter();
  const { wsId, productId } = router.query;

  const productApiPath =
    wsId && productId
      ? `/api/workspaces/${wsId}/inventory/products/${productId}`
      : null;

  const pricesApiPath =
    wsId && productId
      ? `/api/workspaces/${wsId}/inventory/products/${productId}/prices`
      : null;

  const { data: product } = useSWR<Product>(productApiPath);
  const { data: productPrices } = useSWR<ProductPrice[]>(pricesApiPath);

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
  }, [product, productPrices]);

  const [prices, setPrices] = useState<ProductPrice[]>([]);

  useEffect(() => {
    if (productPrices) setPrices(productPrices);
  }, [productPrices]);

  const allPricesHaveUnitId = () =>
    prices.every((price) => price.unit_id.length > 0);

  const hasRequiredFields = () =>
    name.length > 0 && categoryId.length > 0 && allPricesHaveUnitId();

  const addEmptyPrice = () => {
    if (!product && !productPrices) return;
    if (typeof productId !== 'string') return;

    setPrices((prices) => [
      ...prices,
      {
        product_id: productId,
        unit_id: '',
        amount: 0,
        price: 0,
      },
    ]);
  };

  const updateUnitId = (index: number, unitId: string) => {
    setPrices((prices) => {
      const newPrices = [...prices];
      newPrices[index].unit_id = unitId;
      return newPrices;
    });
  };

  const updatePrice = (index: number, price: number) => {
    setPrices((prices) => {
      const newPrices = [...prices];
      newPrices[index].price = price;
      return newPrices;
    });
  };

  const getUniqueUnitIds = () => {
    const unitIds = new Set<string>();
    prices.forEach((price) => unitIds.add(price.unit_id));
    return Array.from(unitIds);
  };

  const removePrice = (index: number) =>
    setPrices((prices) => prices.filter((_, i) => i !== index));

  return (
    <>
      <HeaderX label="Sản phẩm – Kho hàng" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-8">
        <div className="grid gap-x-8 gap-y-4 xl:grid-cols-2 xl:gap-x-16">
          <div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
            <CategorySelector
              categoryId={categoryId}
              setCategoryId={setCategoryId}
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
              //   onClick={hasRequiredFields() ? showLoaderModal : undefined}
            >
              Lưu
            </button>
          </div>
        </div>

        <Divider className="my-4" />
        <div className="grid gap-x-8 gap-y-4 xl:grid-cols-2 xl:gap-x-16">
          <div className="grid h-fit gap-x-4 gap-y-2 md:grid-cols-2">
            <div className="col-span-full">
              <div className="text-2xl font-semibold">Thông tin cơ bản</div>
              <Divider className="my-2" variant="dashed" />
            </div>

            <TextInput
              label="Tên sản phẩm"
              placeholder='Ví dụ: "Paracetamol 500mg"'
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              required
              disabled={!product}
            />
            <TextInput
              label="Đơn vị sản xuất"
              placeholder='Ví dụ: "Công ty TNHH ABC"'
              value={manufacturer}
              onChange={(e) => setManufacturer(e.currentTarget.value)}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              disabled={!product}
            />

            <div className="hidden xl:col-span-2 xl:block" />

            <Textarea
              label="Mô tả"
              placeholder="Giới thiệu sản phẩm, đặc điểm nổi bật, ..."
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              className="md:col-span-2"
              minRows={5}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              disabled={!product}
            />

            <div className="hidden xl:col-span-2 xl:block" />

            <Textarea
              label="Cách dùng"
              placeholder="Hướng dẫn cách sử dụng sản phẩm"
              value={usage}
              onChange={(e) => setUsage(e.currentTarget.value)}
              className="md:col-span-2"
              minRows={5}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              disabled={!product}
            />
          </div>

          <div className="grid h-fit gap-x-4 gap-y-2">
            <div className="col-span-full">
              <div className="text-2xl font-semibold">Đơn giá</div>
              <Divider className="mb-4 mt-2" variant="dashed" />

              <button
                className="rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition hover:bg-blue-300/20"
                onClick={addEmptyPrice}
              >
                + Thêm đơn giá
              </button>
            </div>

            {prices.map((p, idx) => (
              <div
                key={p.product_id + p.unit_id + idx}
                className="flex items-end gap-2 md:gap-4"
              >
                <UnitSelector
                  unitId={p.unit_id}
                  setUnitId={(id) => updateUnitId(idx, id)}
                  blacklist={getUniqueUnitIds()}
                  className="w-full"
                />
                <NumberInput
                  label="Giá bán"
                  placeholder="Giá"
                  value={p.price}
                  onChange={(e) => updatePrice(idx, Number(e))}
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
                <button
                  className="rounded border border-red-300/10 bg-red-300/10 px-1 py-1.5 font-semibold text-red-300 transition hover:bg-red-300/20 md:px-4"
                  onClick={() => removePrice(idx)}
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

ProductOriginPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="product_details">{page}</NestedLayout>;
};

export default ProductOriginPage;
