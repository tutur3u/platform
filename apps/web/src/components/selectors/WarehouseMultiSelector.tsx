import { Squares2X2Icon } from '@heroicons/react/24/solid';
import { MultiSelect } from '@mantine/core';
import useSWR from 'swr';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { ProductWarehouse } from '../../types/primitives/ProductWarehouse';

interface Props {
  warehouseIds: string[];
  setWarehouseIds: (warehouseIds: string[]) => void;
  className?: string;
}

const WarehouseMultiSelector = ({
  warehouseIds,
  setWarehouseIds,
  className,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/inventory/warehouses`;
  const { data: warehouses } = useSWR<ProductWarehouse[]>(
    ws?.id ? apiPath : null
  );

  const data = [
    {
      label: 'Tất cả',
      value: '',
      group: 'Chung',
    },
    ...(warehouses?.map((warehouse) => ({
      label: warehouse.name,
      value: warehouse.id,
      group: 'Kho chứa',
    })) || []),
  ];

  const handleIdsChange = (ids: string[]) => {
    if (ids.length === 0) return setWarehouseIds(['']);

    // Only allow either all, or multiple categories to be selected
    if (ids[0] === '') {
      if (ids.length === 1) {
        // "All" is selected, so clear all other selections
        setWarehouseIds(ids);
        return;
      }

      // "All" is not selected, so remove it from the list
      setWarehouseIds(ids.filter((id) => id !== ''));
    } else if (ids.length > 1 && ids.includes('')) {
      // Since "All" is selected, remove all other selections
      setWarehouseIds(['']);
    } else {
      setWarehouseIds(ids);
    }
  };

  return (
    <MultiSelect
      label="Kho chứa"
      placeholder="Chọn kho chứa"
      icon={<Squares2X2Icon className="h-5" />}
      data={data}
      value={warehouseIds.length > 0 ? warehouseIds : ['']}
      onChange={handleIdsChange}
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
      disabled={!warehouses}
      searchable
    />
  );
};

export default WarehouseMultiSelector;
