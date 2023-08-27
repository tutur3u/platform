import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import useSWR from 'swr';
import { Divider, TextInput } from '@mantine/core';
import { useRouter } from 'next/router';
import { openModal } from '@mantine/modals';
import CategoryEditModal from '../../../../../components/loaders/categories/CategoryEditModal';
import CategoryDeleteModal from '../../../../../components/loaders/categories/CategoryDeleteModal';
import { ProductCategory } from '../../../../../types/primitives/ProductCategory';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';

export const getServerSideProps = enforceHasWorkspaces;

const CategoryDetailsPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const router = useRouter();
  const { wsId, categoryId } = router.query;

  const apiPath =
    wsId && categoryId
      ? `/api/workspaces/${wsId}/inventory/categories/${categoryId}`
      : null;

  const { data: category } = useSWR<ProductCategory>(apiPath);

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
              href: `/${ws.id}/inventory/categories`,
            },
            {
              content: category?.name || 'Không có tên',
              href: `/${ws.id}/inventory/categories/${categoryId}`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, category, categoryId, setRootSegment]);

  const [name, setName] = useState<string>('');

  useEffect(() => {
    if (category) {
      setName(category?.name || '');
    }
  }, [category]);

  const hasRequiredFields = () => name.length > 0;

  const showEditModal = () => {
    if (!category || !ws) return;
    if (typeof categoryId !== 'string') return;

    openModal({
      title: <div className="font-semibold">Cập nhật danh mục sản phẩm</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <CategoryEditModal
          wsId={ws.id}
          oldCategory={category}
          category={{
            id: categoryId,
            name,
          }}
        />
      ),
    });
  };

  const showDeleteModal = () => {
    if (!category || !ws) return;
    if (typeof categoryId !== 'string') return;

    openModal({
      title: <div className="font-semibold">Xóa danh mục sản phẩm</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: <CategoryDeleteModal wsId={ws.id} categoryId={categoryId} />,
    });
  };

  return (
    <>
      <HeaderX label="Sản phẩm – Kho hàng" />
      <div className="mt-2 flex min-h-full w-full flex-col ">
        <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
          <div className="flex items-end justify-end gap-2">
            <button
              className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
                category
                  ? 'hover:bg-red-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={category ? showDeleteModal : undefined}
            >
              Xoá
            </button>

            <button
              className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
                hasRequiredFields()
                  ? 'hover:bg-blue-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={hasRequiredFields() ? showEditModal : undefined}
            >
              Lưu thay đổi
            </button>
          </div>
        </div>

        <Divider className="my-4" />
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
            required
            disabled={!category}
          />
        </div>
      </div>
    </>
  );
};

CategoryDetailsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default CategoryDetailsPage;
