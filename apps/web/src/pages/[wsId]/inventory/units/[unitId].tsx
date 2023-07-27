import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import useSWR from 'swr';
import { Checkbox, Divider, TextInput } from '@mantine/core';
import { useRouter } from 'next/router';
import { openModal } from '@mantine/modals';
import UnitEditModal from '../../../../components/loaders/units/UnitEditModal';
import UnitDeleteModal from '../../../../components/loaders/units/UnitDeleteModal';
import { ProductUnit } from '../../../../types/primitives/ProductUnit';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import useTranslation from 'next-translate/useTranslation';
import InventoryItemTab from '../../../../components/inventory/InventoryItemTab';

export const getServerSideProps = enforceHasWorkspaces;

const UnitDetailsPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const { t } = useTranslation('inventory-units-configs');
  const unitSettingText = t('unit-setting');
  const unitNameText = t('unit-name');
  const unitNamePLaceholderText = t('unit-name-placeholder');

  const router = useRouter();
  const { unitId } = router.query;

  const unitApiPath = `/api/workspaces/${ws?.id}/inventory/units/${unitId}`;
  const { data: unit } = useSWR<ProductUnit>(unitId ? unitApiPath : null);

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
              href: `/${ws.id}/inventory/units`,
            },
            {
              content: unit?.name || 'Không có tên',
              href: `/${ws.id}/inventory/units/${unitId}`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, unit, unitId, setRootSegment]);

  const [name, setName] = useState<string>('');

  useEffect(() => {
    if (unit) {
      setName(unit?.name || '');
    }
  }, [unit]);

  const hasRequiredFields = () => name.length > 0;

  const showEditModal = () => {
    if (!unit || !ws) return;
    if (typeof unitId !== 'string') return;

    openModal({
      title: <div className="font-semibold">Cập nhật đơn vị tính</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <UnitEditModal
          wsId={ws.id}
          oldUnit={unit}
          unit={{
            id: unitId,
            name,
          }}
        />
      ),
    });
  };

  const showDeleteModal = () => {
    if (!unit || !ws) return;
    if (typeof unitId !== 'string') return;

    openModal({
      title: <div className="font-semibold">Xóa đơn vị tính</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: <UnitDeleteModal wsId={ws.id} unitId={unitId} />,
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
                unit ? 'hover:bg-red-300/20' : 'cursor-not-allowed opacity-50'
              }`}
              onClick={unit ? showDeleteModal : undefined}
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
        <div className="grid h-fit gap-x-4 gap-y-2 md:w-1/2">
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

UnitDetailsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default UnitDetailsPage;
