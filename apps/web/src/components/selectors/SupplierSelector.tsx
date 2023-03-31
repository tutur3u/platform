import { Select } from '@mantine/core';
import { ProductSupplier } from '../../types/primitives/ProductSupplier';
import useSWR from 'swr';
import { useWorkspaces } from '../../hooks/useWorkspaces';

interface Props {
  supplierId: string;
  setSupplierId: (supplierId: string) => void;
  required?: boolean;
}

const SupplierSelector = ({ supplierId, setSupplierId, required }: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/inventory/suppliers`;
  const { data: suppliers } = useSWR<ProductSupplier[]>(
    ws?.id ? apiPath : null
  );

  const data = [
    ...(suppliers?.map((supplier) => ({
      label: supplier.name,
      value: supplier.id,
    })) || []),
  ];

  return (
    <Select
      label="Nhà cung cấp"
      placeholder="Chọn nhà cung cấp"
      data={data}
      value={supplierId}
      onChange={setSupplierId}
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
      disabled={!suppliers}
      searchable
      required={required}
    />
  );
};

export default SupplierSelector;
