import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Checkbox, Divider, TextInput } from '@mantine/core';
import { openModal } from '@mantine/modals';
import UnitCreateModal from '../../../../components/loaders/units/UnitCreateModal';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import { useSegments } from '../../../../hooks/useSegments';
import useTranslation from 'next-translate/useTranslation';
import InventoryItemTab from '../../../../components/inventory/InventoryItemTab';

export const getServerSideProps = enforceHasWorkspaces;

const NewUnitPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const { t } = useTranslation('inventory-units-configs');
  const unitSettingText = t('unit-setting');
  const unitNameText = t('unit-name');
  const unitNamePLaceholderText = t('unit-name-placeholder');

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
              content: 'Đơn vị tính',
              href: `/${ws.id}/inventory/units`,
            },
            { content: 'Tạo mới', href: `/${ws.id}/inventory/units/new` },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [name, setName] = useState<string>('');

  const hasRequiredFields = () => name.length > 0;

  const showLoaderModal = () => {
    if (!ws) return;
    openModal({
      title: <div className="font-semibold">Tạo đơn vị tính mới</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: <UnitCreateModal wsId={ws.id} unit={{ name }} />,
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
              Tạo mới
            </button>
          </div>
        </div>

        <Divider className="my-4" />
        <div className="grid h-fit gap-x-4 gap-y-2 md:grid-cols-2">
          <InventoryItemTab title={unitSettingText} description={unitNameText}>
            <TextInput
              placeholder={unitNamePLaceholderText}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              required
            />
          </InventoryItemTab>
        </div>
      </div>
    </>
  );
};

NewUnitPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NewUnitPage;
