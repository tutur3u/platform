import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Checkbox, Divider, TextInput } from '@mantine/core';
import { openModal } from '@mantine/modals';
import CategoryCreateModal from '../../../../components/loaders/categories/CategoryCreateModal';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import useTranslation from 'next-translate/useTranslation';
import InventoryItemTab from '../../../../components/inventory/InventoryItemTab';

export const getServerSideProps = enforceHasWorkspaces;

const NewCategoryPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();
  const { t } = useTranslation('categories');
  const basicInfoText = t('basic-info');
  const categoryNameText = t('category-name');
  const categoryNamePLaceholderText = t('category-placeholder');

  const createButtonText = t('create');
  const categoryTypeText = t('type');
  const quantityUnitText = t('quantity-unit');

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
              content: 'Danh mục sản phẩm',
              href: `/${ws.id}/inventory/categories`,
            },
            {
              content: 'Tạo mới',
              href: `/${ws.id}/inventory/categories/new`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [name, setName] = useState<string>('');
  const [type, setType] = useState<'quantity' | 'non-quantity'>('quantity');

  const hasRequiredFields = () => name.length > 0;

  const showLoaderModal = () => {
    if (!ws) return;
    openModal({
      title: <div className="font-semibold">Tạo danh mục sản phẩm mới</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: <CategoryCreateModal wsId={ws.id} category={{ name, type }} />,
    });
  };

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
              {createButtonText}
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
              checked
              onChange={() => {
                setType(type === 'quantity' ? 'non-quantity' : 'quantity')
              }}
            />
          </InventoryItemTab>
        </div>
      </div>
    </>
  );
};

NewCategoryPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NewCategoryPage;
