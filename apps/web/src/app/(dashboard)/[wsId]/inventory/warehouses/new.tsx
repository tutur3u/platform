import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import { Divider, TextInput } from '@mantine/core';
import { openModal } from '@mantine/modals';
import WarehouseCreateModal from '../../../../../components/loaders/warehouses/WarehouseCreateModal';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';

export const getServerSideProps = enforceHasWorkspaces;

const NewWarehousePage: PageWithLayoutProps = () => {
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
              content: 'Kho chứa',
              href: `/${ws.id}/inventory/warehouses`,
            },
            {
              content: 'Tạo mới',
              href: `/${ws.id}/inventory/warehouses/new`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [name, setName] = useState<string>('');

  const hasRequiredFields = () => name.length > 0;

  const showLoaderModal = () => {
    if (!ws?.id) return;
    openModal({
      title: <div className="font-semibold">Tạo kho chứa mới</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: <WarehouseCreateModal wsId={ws.id} warehouse={{ name }} />,
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
          <div className="col-span-full">
            <div className="text-2xl font-semibold">Thông tin cơ bản</div>
            <Divider className="my-2" variant="dashed" />
          </div>

          <TextInput
            label="Tên kho chứa"
            placeholder='Ví dụ: "Kho tổng", "Kho Lê Hồng Phong"'
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
          />
        </div>
      </div>
    </>
  );
};

NewWarehousePage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NewWarehousePage;
