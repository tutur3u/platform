import { Select } from '@mantine/core';
import { UserRole } from '../../types/primitives/UserRole';
import useSWR from 'swr';
import { useEffect } from 'react';
import { useWorkspaces } from '../../hooks/useWorkspaces';

interface Props {
  role: UserRole;
  setRole: (role: UserRole | null) => void;

  blacklist?: string[];
  className?: string;

  disabled?: boolean;
  required?: boolean;
}

const UserRoleSelector = ({
  role,
  setRole,

  blacklist = [],
  className,

  disabled = false,
  required = false,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/users/roles?blacklist=${blacklist
    .filter((id) => id !== role?.id && id !== '')
    .join(',')}`;

  const { data: roles } = useSWR<UserRole[]>(ws?.id ? apiPath : null);

  const data = [
    ...(roles?.map((role) => ({
      label: role.name,
      value: role.id,
      disabled: blacklist.includes(role.id),
    })) || []),
  ];

  useEffect(() => {
    if (!roles || !setRole) return;

    if (roles.length === 1 && !role?.id) setRole(roles[0]);
    else if (role?.id && !roles?.find((p) => p.id === role.id)) setRole(null);
  }, [role, roles, setRole]);

  return (
    <Select
      label="Vai trò"
      placeholder="Chọn vai trò"
      data={data}
      value={role?.id}
      onChange={(id) => setRole(roles?.find((r) => r.id === id) || null)}
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
      disabled={!roles || disabled}
      required={required}
      searchable
    />
  );
};

export default UserRoleSelector;
