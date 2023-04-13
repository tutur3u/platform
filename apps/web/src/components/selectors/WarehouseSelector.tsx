import { Select } from '@mantine/core';
import { ProductWarehouse } from '../../types/primitives/ProductWarehouse';
import useSWR, { mutate } from 'swr';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { showNotification } from '@mantine/notifications';

interface Props {
  warehouseId: string;
  setWarehouseId: (warehouseId: string) => void;

  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  creatable?: boolean;
}

const WarehouseSelector = ({
  warehouseId,
  setWarehouseId,

  disabled = false,
  required = false,
  searchable = true,
  creatable = true,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/inventory/warehouses`;
  const { data: warehouses } = useSWR<ProductWarehouse[]>(
    ws?.id ? apiPath : null
  );

  const data = [
    ...(warehouses?.map((warehouse) => ({
      label: warehouse.name,
      value: warehouse.id,
    })) || []),
  ];

  const create = async ({
    warehouse,
  }: {
    wsId: string;
    warehouse: Partial<ProductWarehouse>;
  }): Promise<ProductWarehouse | null> => {
    const res = await fetch(apiPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(warehouse),
    });

    if (res.ok) {
      const { id } = await res.json();

      if (!id || typeof id !== 'string') {
        showNotification({
          title: 'Lỗi',
          message: 'Không thể tạo kho hàng',
          color: 'red',
        });
        return null;
      }

      return { ...warehouse, id };
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo kho hàng',
        color: 'red',
      });
      return null;
    }
  };

  return (
    <Select
      label="Kho chứa"
      placeholder="Chọn kho chứa"
      data={data}
      value={warehouseId}
      onChange={setWarehouseId}
      classNames={{
        input:
          'bg-[#3f3a3a]/30 border-zinc-300/20 focus:border-zinc-300/20 border-zinc-300/20 font-semibold',
        dropdown: 'bg-[#323030]',
      }}
      styles={{
        item: {
          // applies styles to selected item
          '&[data-selected]': {
            '&, &:hover': {
              backgroundColor: '#6b686b',
              color: '#fff',
              fontWeight: 600,
            },
          },

          // applies styles to hovered item
          '&:hover': {
            backgroundColor: '#454345',
            color: '#fff',
          },
        },
      }}
      getCreateLabel={(query) => (
        <div>
          + Tạo <span className="font-semibold">{query}</span>
        </div>
      )}
      onCreate={(query) => {
        if (!ws?.id) return null;

        create({
          wsId: ws.id,
          warehouse: {
            name: query,
          },
        }).then((item) => {
          if (!item) return null;

          mutate(apiPath, [...(warehouses || []), item]);
          setWarehouseId(item.id);

          return {
            label: item.name,
            value: item.id,
          };
        });
      }}
      nothingFound="Không tìm thấy kho hàng nào"
      disabled={!warehouses || disabled}
      required={required}
      searchable={searchable}
      creatable={!!ws?.id && creatable}
    />
  );
};

export default WarehouseSelector;
