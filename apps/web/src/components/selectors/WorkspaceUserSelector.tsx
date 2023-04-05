import { Select } from '@mantine/core';
import { WorkspaceUser } from '../../types/primitives/WorkspaceUser';
import useSWR from 'swr';
import { useEffect } from 'react';
import { useWorkspaces } from '../../hooks/useWorkspaces';

interface Props {
  userId: string;
  setUserId: (userId: string) => void;

  className?: string;
  notEmpty?: boolean;
  required?: boolean;
}

const WorkspaceUserSelector = ({
  userId,
  setUserId,

  className,
  notEmpty = false,
  required = false,
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

  return (
    <Select
      label="Người dùng"
      placeholder="Chọn người dùng"
      data={data}
      value={userId}
      onChange={setUserId}
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
      disabled={!users}
      searchable
      clearable
      required={required}
    />
  );
};

export default WorkspaceUserSelector;
