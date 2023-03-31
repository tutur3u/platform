import { Select } from '@mantine/core';
import { ProductWarehouse } from '../../types/primitives/ProductWarehouse';
import useSWR from 'swr';
import { useWorkspaces } from '../../hooks/useWorkspaces';

interface Props {
  warehouseId: string;
  setWarehouseId: (warehouseId: string) => void;
  required?: boolean;
}

const WarehouseSelector = ({
  warehouseId,
  setWarehouseId,
  required,
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
      disabled={!warehouses}
      searchable
      required={required}
    />
  );
};

export default WarehouseSelector;
