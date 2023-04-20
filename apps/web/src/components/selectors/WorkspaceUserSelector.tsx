import { Select } from '@mantine/core';
import { WorkspaceUser } from '../../types/primitives/WorkspaceUser';
import useSWR, { mutate } from 'swr';
import { useEffect } from 'react';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { showNotification } from '@mantine/notifications';

interface Props {
  userId: string;
  setUserId: (userId: string) => void;

  className?: string;

  notEmpty?: boolean;
  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  creatable?: boolean;
}

const WorkspaceUserSelector = ({
  userId,
  setUserId,

  className,

  notEmpty = false,
  disabled = false,
  required = false,
  searchable = true,
  creatable = true,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/users`;
  const { data: users } = useSWR<WorkspaceUser[]>(ws?.id ? apiPath : null);

  const data = notEmpty
    ? [
        ...(users?.map((user) => ({
          label: user.name,
          value: user.id,
        })) || []),
      ]
    : [
        {
          label: 'Khách vãng lai',
          value: '',
        },
        ...(users?.map((user) => ({
          label: user.name,
          value: user.id,
        })) || []),
      ];

  useEffect(() => {
    if (!users) return;

    if (users.length === 1) setUserId(users[0].id);
    else if (userId && !users?.find((p) => p.id === userId)) setUserId('');
  }, [userId, users, setUserId]);

  const create = async ({
    warehouse,
  }: {
    wsId: string;
    warehouse: Partial<WorkspaceUser>;
  }): Promise<WorkspaceUser | null> => {
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
          message: 'Không thể tạo người dùng',
          color: 'red',
        });
        return null;
      }

      return { ...warehouse, id };
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo người dùng',
        color: 'red',
      });
      return null;
    }
  };

  return (
    <Select
      label="Người dùng"
      placeholder="Chọn người dùng"
      data={data}
      value={userId}
      onChange={setUserId}
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

          mutate(apiPath, [...(users || []), item]);
          setUserId(item.id);

          return {
            label: item.name,
            value: item.id,
          };
        });
      }}
      nothingFound="Không tìm thấy người dùng nào"
      disabled={!users || disabled}
      required={required}
      searchable={searchable}
      creatable={!!ws?.id && creatable}
    />
  );
};

export default WorkspaceUserSelector;
