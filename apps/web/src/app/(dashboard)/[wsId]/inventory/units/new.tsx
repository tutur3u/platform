import { useEffect, useState } from 'react';
import { Divider, TextInput } from '@mantine/core';
import { openModal } from '@mantine/modals';
import UnitCreateModal from '../../../../../components/loaders/units/UnitCreateModal';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import { useSegments } from '../../../../../hooks/useSegments';

export default function NewUnitPage() {
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
          label="Tên đơn vị tính"
          placeholder='Ví dụ: "Thuốc", "Thực phẩm"'
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />
      </div>
    </div>
  );
}
