import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import { Divider, TextInput, Textarea } from '@mantine/core';
import CategorySelector from '../../../../../components/selectors/CategorySelector';
import { openModal } from '@mantine/modals';
import ProductCreateModal from '../../../../../components/loaders/products/ProductCreateModal';
import { useLocalStorage } from '@mantine/hooks';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';

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

  const hasRequiredFields = () => name.length > 0 && categoryId.length > 0;

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
            description,
            usage,
          }}
        />
      ),
    });
  };

  return (
    <>
      <HeaderX label="Sản phẩm – Kho hàng" />
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
            />

            <Textarea
              label="Mô tả"
              placeholder="Giới thiệu sản phẩm, đặc điểm nổi bật, ..."
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              minRows={5}
            />

            <Textarea
              label="Cách dùng"
              placeholder="Hướng dẫn cách sử dụng sản phẩm"
              value={usage}
              onChange={(e) => setUsage(e.currentTarget.value)}
              minRows={5}
            />

            <div className="flex gap-2">
              <button
                className={`w-full rounded border border-blue-500/10 bg-blue-500/10 px-4 py-2 font-semibold text-blue-600 transition dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 ${
                  hasRequiredFields()
                    ? 'hover:bg-blue-500/20 dark:hover:bg-blue-300/20'
                    : 'cursor-not-allowed opacity-50'
                }`}
                onClick={hasRequiredFields() ? showCreateModal : undefined}
              >
                Tạo mới
              </button>
            </div>
          </div>

          <div className="xl:col-span-3">
            <div className="col-span-full">
              <div className="text-2xl font-semibold">Đơn giá</div>
              <Divider className="mb-4 mt-2" variant="dashed" />
            </div>

            <div className="bg-zinc-zinc-500/5 flex min-h-full items-center justify-center rounded border border-zinc-300 p-4 text-center text-2xl font-semibold text-zinc-500 dark:border-zinc-300/10 dark:bg-zinc-900 dark:text-zinc-500">
              Chỉ có thể tạo đơn giá sau khi tạo sản phẩm
            </div>
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
