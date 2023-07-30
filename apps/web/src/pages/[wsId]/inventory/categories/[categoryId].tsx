import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import useSWR from 'swr';
import { Checkbox, Divider, TextInput } from '@mantine/core';
import { useRouter } from 'next/router';
import { openModal } from '@mantine/modals';
import CategoryEditModal from '../../../../components/loaders/categories/CategoryEditModal';
import CategoryDeleteModal from '../../../../components/loaders/categories/CategoryDeleteModal';
import { ProductCategory } from '../../../../types/primitives/ProductCategory';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import useTranslation from 'next-translate/useTranslation';
import InventoryItemTab from '../../../../components/inventory/InventoryItemTab';

export const getServerSideProps = enforceHasWorkspaces;

const CategoryDetailsPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();
  const { t } = useTranslation('categories');
  const basicInfoText = t('basic-info');
  const categoryNameText = t('category-name');
  const categoryNamePLaceholderText = t('category-placeholder');

  const createButtonText = t('create');
  const categoryTypeText = t('type');
  const quantityUnitText = t('quantity-unit');

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
  const [type, setType] = useState<'quantity' | 'non-quantity'>('quantity');

  useEffect(() => {
    if (category) {
      setName(category?.name || '');
      setType(category?.type === 'quantity' ? 'quantity' : 'non-quantity');
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
            type,
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
        <div className="grid h-fit gap-x-4 gap-y-2  md:w-1/2">
          <InventoryItemTab
            title={basicInfoText}
            description={categoryNameText}
          >
            <TextInput
              placeholder={categoryNamePLaceholderText}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              required
            />
          </InventoryItemTab>
          <InventoryItemTab description={categoryTypeText}>
            <Checkbox
              label={quantityUnitText}
              color="grape"
              checked={type === 'quantity'}
              onChange={() => {
                setType(type === 'quantity' ? 'non-quantity' : 'quantity');
              }}
            />
          </InventoryItemTab>
        </div>
      </div>
    </>
  );
};

CategoryDetailsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default CategoryDetailsPage;
