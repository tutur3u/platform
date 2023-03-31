import { Select } from '@mantine/core';
import { ProductUnit } from '../../types/primitives/ProductUnit';
import useSWR from 'swr';
import { useWorkspaces } from '../../hooks/useWorkspaces';

interface Props {
  unitId: string;
  setUnitId: (unitId: string) => void;
  blacklist?: string[];

  customApiPath?: string;

  required?: boolean;
  disabled?: boolean;
  className?: string;
}

const UnitSelector = ({
  unitId,
  setUnitId,
  blacklist,

  customApiPath,

  required = false,
  disabled = false,
  className,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = customApiPath ?? `/api/workspaces/${ws?.id}/inventory/units`;
  const { data: units } = useSWR<ProductUnit[]>(ws?.id ? apiPath : null);

  const data = [
    ...(units?.map((unit) => ({
      label: unit.name,
      value: unit.id,
      disabled: blacklist?.includes(unit.id),
    })) || []),
  ];

  return (
    <Select
      label="Đơn vị tính"
      placeholder="Chọn đơn vị tính"
      data={data}
      value={unitId}
      onChange={setUnitId}
      className={className}
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
      disabled={!units || disabled}
      required={required}
      searchable
    />
  );
};

export default UnitSelector;
