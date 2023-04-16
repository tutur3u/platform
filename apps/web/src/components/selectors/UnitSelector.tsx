import { Select } from '@mantine/core';
import { ProductUnit } from '../../types/primitives/ProductUnit';
import useSWR, { mutate } from 'swr';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { showNotification } from '@mantine/notifications';

interface Props {
  unitId?: string;
  setUnitId?: (unitId: string) => void;
  blacklist?: string[];

  customApiPath?: string;
  className?: string;

  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  creatable?: boolean;
}

const UnitSelector = ({
  unitId,
  setUnitId,
  blacklist,

  customApiPath,
  className,

  disabled = false,
  required = false,
  searchable = true,
  creatable = true,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath =
    customApiPath ??
    `/api/workspaces/${ws?.id}/inventory/units?blacklist=${
      blacklist?.filter((id) => id !== unitId && id !== '')?.join(',') || ''
    }`;

  const { data: units } = useSWR<ProductUnit[]>(ws?.id ? apiPath : null);

  const data = [
    ...(units?.map((unit) => ({
      label: unit.name,
      value: unit.id,
      disabled: blacklist?.includes(unit.id),
    })) || []),
  ];

  const create = async ({
    unit,
  }: {
    wsId: string;
    unit: Partial<ProductUnit>;
  }): Promise<ProductUnit | null> => {
    const res = await fetch(apiPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(unit),
    });

    if (res.ok) {
      const { id } = await res.json();

      if (!id || typeof id !== 'string') {
        showNotification({
          title: 'Lỗi',
          message: 'Không thể tạo đơn vị tính',
          color: 'red',
        });
        return null;
      }

      return { ...unit, id };
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo đơn vị tính',
        color: 'red',
      });
      return null;
    }
  };

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
      getCreateLabel={(query) => (
        <div>
          + Tạo <span className="font-semibold">{query}</span>
        </div>
      )}
      onCreate={(query) => {
        if (!ws?.id) return null;

        create({
          wsId: ws.id,
          unit: {
            name: query,
          },
        }).then((item) => {
          if (!item) return null;

          mutate(apiPath, [...(units || []), item]);
          if (setUnitId) setUnitId(item.id);

          return {
            label: item.name,
            value: item.id,
          };
        });
      }}
      nothingFound="Không tìm thấy đơn vị tính nào"
      disabled={!units || disabled}
      required={required}
      searchable={searchable}
      creatable={!!ws?.id && creatable}
    />
  );
};

export default UnitSelector;
