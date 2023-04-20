import { Select } from '@mantine/core';
import { VitalGroup } from '../../types/primitives/VitalGroup';
import useSWR, { mutate } from 'swr';
import { useEffect } from 'react';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { showNotification } from '@mantine/notifications';

interface Props {
  groupId: string;
  setGroupId: (groupId: string) => void;

  blacklist?: string[];
  className?: string;

  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  creatable?: boolean;
}

const VitalGroupSelector = ({
  groupId,
  setGroupId,

  blacklist = [],
  className,

  disabled = false,
  required = false,
  searchable = true,
  creatable = true,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/healthcare/vital-groups`;
  const { data: groups } = useSWR<VitalGroup[]>(ws?.id ? apiPath : null);

  const data = [
    ...(groups?.map((vital) => ({
      label: vital.name,
      value: vital.id,
      disabled: blacklist.includes(vital.id),
    })) || []),
  ];

  useEffect(() => {
    if (!groupId && groups?.length === 1) setGroupId(groups[0].id);
  }, [groupId, groups, setGroupId]);

  const create = async ({
    warehouse,
  }: {
    wsId: string;
    warehouse: Partial<VitalGroup>;
  }): Promise<VitalGroup | null> => {
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
          message: 'Không thể tạo nhóm chỉ số',
          color: 'red',
        });
        return null;
      }

      return { ...warehouse, id };
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo nhóm chỉ số',
        color: 'red',
      });
      return null;
    }
  };

  return (
    <Select
      label="Nhóm chỉ số"
      placeholder="Chọn nhóm chỉ số"
      data={data}
      value={groupId}
      onChange={setGroupId}
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

          mutate(apiPath, [...(groups || []), item]);
          setGroupId(item.id);

          return {
            label: item.name,
            value: item.id,
          };
        });
      }}
      nothingFound="Không tìm thấy nhóm chỉ số nào"
      disabled={!groups || disabled}
      required={required}
      searchable={searchable}
      creatable={!!ws?.id && creatable}
    />
  );
};

export default VitalGroupSelector;
