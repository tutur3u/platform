import { Select } from '@mantine/core';
import { ProductWarehouse } from '../../types/primitives/ProductWarehouse';
import useSWR, { mutate } from 'swr';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { showNotification } from '@mantine/notifications';

interface Props {
  warehouseId: string | undefined;
  setWarehouseId?: (warehouseId: string) => void;

  blacklist?: string[];
  className?: string;

  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  creatable?: boolean;
}

const WarehouseSelector = ({
  warehouseId,
  setWarehouseId,

  blacklist,
  className,

  disabled = false,
  required = false,
  searchable = true,
  creatable = true,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/inventory/warehouses?blacklist=${
    blacklist?.filter((id) => id !== warehouseId && id !== '')?.join(',') || ''
  }`;
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
      className={className}
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
          if (setWarehouseId) setWarehouseId(item.id);

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
