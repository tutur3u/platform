import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Divider, NumberInput, TextInput, Textarea } from '@mantine/core';
import CategorySelector from '../../../../components/selectors/CategorySelector';
import { ProductPrice } from '../../../../types/primitives/ProductPrice';
import UnitSelector from '../../../../components/selectors/UnitSelector';
import { TrashIcon } from '@heroicons/react/24/solid';
import { openModal } from '@mantine/modals';
import ProductCreateModal from '../../../../components/loaders/products/ProductCreateModal';
import { useLocalStorage } from '@mantine/hooks';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';

export const getServerSideProps = enforceHasWorkspaces;

const NewProductPage: PageWithLayoutProps = () => {
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
              content: 'Sản phẩm',
              href: `/${ws.id}/inventory/products`,
            },
            { content: 'Tạo mới', href: `/${ws.id}/inventory/products/new` },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [categoryId, setCategoryId] = useLocalStorage({
    key: 'new-product-category-id',
    defaultValue: '',
  });

  const [name, setName] = useState<string>('');
  const [manufacturer, setManufacturer] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [usage, setUsage] = useState<string>('');

  const [prices, setPrices] = useState<ProductPrice[]>([]);

  const allPricesHaveUnitId = () =>
    prices.every((price) => price.unit_id.length > 0);

  const hasRequiredFields = () =>
    name.length > 0 && categoryId.length > 0 && allPricesHaveUnitId();

  const addEmptyPrice = () => {
    setPrices((prices) => [
      ...prices,
      {
        product_id: '',
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

  const showCreateModal = () => {
    if (!ws) return;
    openModal({
      title: <div className="font-semibold">Tạo sản phẩm mới</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <ProductCreateModal
          wsId={ws.id}
          product={{
            name,
            manufacturer,
            category_id: categoryId,
          }}
          prices={prices}
        />
      ),
    });
  };

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
              onClick={hasRequiredFields() ? showCreateModal : undefined}
            >
              Tạo mới
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
            />
            <TextInput
              label="Đơn vị sản xuất"
              placeholder='Ví dụ: "Công ty TNHH ABC"'
              value={manufacturer}
              onChange={(e) => setManufacturer(e.currentTarget.value)}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
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
                className="flex items-end gap-2"
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

NewProductPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NewProductPage;
