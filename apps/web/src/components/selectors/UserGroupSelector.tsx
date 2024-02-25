import { Select } from '@mantine/core';
import { UserGroup } from '@/types/primitives/UserGroup';
import useSWR, { mutate } from 'swr';
import { useEffect } from 'react';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { showNotification } from '@mantine/notifications';

interface Props {
  group: UserGroup;
  setGroup: (group: UserGroup | null) => void;

  blacklist?: string[];
  className?: string;

  hideLabel?: boolean;
  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  creatable?: boolean;
  clearable?: boolean;
  preventPreselect?: boolean;
}

const UserGroupSelector = ({
  group,
  setGroup,

  blacklist = [],
  className,

  hideLabel = false,
  disabled = false,
  required = false,
  searchable = true,
  creatable = true,
  clearable = true,
  preventPreselect = false,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/users/groups?blacklist=${blacklist
    .filter((id) => id !== group?.id && id !== '')
    .join(',')}`;

  const { data: fetchedData } = useSWR<{ data: UserGroup[]; count: number }>(
    ws?.id ? apiPath : null
  );

  const groups = fetchedData?.data;

  const data = [
    ...(groups?.map((group) => ({
      label: group.name,
      value: group.id,
      disabled: blacklist.includes(group.id),
    })) || []),
  ];

  useEffect(() => {
    if (!groups || !setGroup || preventPreselect) return;

    if (groups.length === 1 && !group?.id) setGroup(groups[0]);
    else if (group?.id && !groups?.find((p) => p.id === group.id))
      setGroup(null);
  }, [preventPreselect, group, groups, setGroup]);

  const create = async ({
    group,
  }: {
    wsId: string;
    group: Partial<UserGroup>;
  }): Promise<UserGroup | null> => {
    const res = await fetch(apiPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(group),
    });

    if (res.ok) {
      const { id } = await res.json();

      if (!id || typeof id !== 'string') {
        showNotification({
          title: 'Lỗi',
          message: 'Không thể tạo nhóm người dùng',
          color: 'red',
        });
        return null;
      }

      return { ...group, id };
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo nhóm người dùng',
        color: 'red',
      });
      return null;
    }
  };

  return (
    <Select
      label={hideLabel ? undefined : 'Nhóm người dùng'}
      placeholder="Chọn nhóm người dùng"
      data={data}
      value={group?.id}
      onChange={(id) => setGroup(groups?.find((r) => r.id === id) || null)}
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
          group: {
            name: query,
          },
        }).then((item) => {
          if (!item) return null;

          mutate(apiPath, [...(groups || []), item]);
          setGroup(item);

          return {
            label: item.name,
            value: item.id,
          };
        });
      }}
      nothingFound="Không tìm thấy nhóm nào"
      disabled={!groups || disabled}
      required={required}
      searchable={searchable}
      creatable={!!ws?.id && creatable}
      clearable={clearable}
    />
  );
};

export default UserGroupSelector;
