import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Divider, TextInput } from '@mantine/core';
import { useRouter } from 'next/router';
import { openModal } from '@mantine/modals';
import WarehouseEditModal from '../../../../../components/loaders/warehouses/WarehouseEditModal';
import WarehouseDeleteModal from '../../../../../components/loaders/warehouses/WarehouseDeleteModal';
import { ProductWarehouse } from '../../../../../types/primitives/ProductWarehouse';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import { useSegments } from '../../../../../hooks/useSegments';

export default function WarehouseDetailsPage() {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const router = useRouter();
  const { wsId, warehouseId } = router.query;

  const apiPath =
    wsId && warehouseId
      ? `/api/workspaces/${wsId}/inventory/warehouses/${warehouseId}`
      : null;

  const { data: warehouse } = useSWR<ProductWarehouse>(apiPath);

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
              content: warehouse?.name || 'Không có tên',
              href: `/${ws.id}/inventory/warehouses/${warehouseId}`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, warehouse, warehouseId, setRootSegment]);

  const [name, setName] = useState<string>('');

  useEffect(() => {
    if (warehouse) {
      setName(warehouse?.name || '');
    }
  }, [warehouse]);

  const hasRequiredFields = () => name.length > 0;

  const showEditModal = () => {
    if (!warehouse) return;
    if (typeof warehouseId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">Cập nhật đơn vị tính</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <WarehouseEditModal
          wsId={ws.id}
          oldWarehouse={warehouse}
          warehouse={{
            id: warehouseId,
            name,
          }}
        />
      ),
    });
  };

  const showDeleteModal = () => {
    if (!warehouse) return;
    if (typeof warehouseId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">Xóa đơn vị tính</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: <WarehouseDeleteModal wsId={ws.id} warehouseId={warehouseId} />,
    });
  };

  return (
    <div className="mt-2 flex min-h-full w-full flex-col ">
      <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
        <div className="flex items-end justify-end gap-2">
          <button
            className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
              warehouse
                ? 'hover:bg-red-300/20'
                : 'cursor-not-allowed opacity-50'
            }`}
            onClick={warehouse ? showDeleteModal : undefined}
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
          label="Tên kho"
          placeholder='Ví dụ: "Kho hàng chính"'
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
          disabled={!warehouse}
        />
      </div>
    </div>
  );
}
