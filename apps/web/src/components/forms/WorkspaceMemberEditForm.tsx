import { Button, Divider, Select, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import React, { useState } from 'react';
import { ChangeEvent } from 'react';
import { User, UserRole } from '../../types/primitives/User';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  currentUserId: string;
  currentRole: UserRole;
  wsId: string;
  user?: User;
  onSubmit: (wsId: string, user: User) => Promise<void>;
  onDelete?: () => Promise<void>;
  disallowOwnerChange?: boolean;
}

const WorkspaceMemberEditForm = ({
  currentUserId,
  currentRole,
  wsId,
  user,
  onSubmit,
  onDelete,
  disallowOwnerChange,
}: Props) => {
  const { t } = useTranslation('ws-members');

  const [role, setRole] = useState<UserRole>(user?.role || 'MEMBER');
  const [roleTitle, setRoleTitle] = useState(user?.role_title || '');

  const availableRoles: UserRole[] = ['MEMBER', 'ADMIN', 'OWNER'];

  const getRolePriority = (role: UserRole) => {
    switch (role) {
      case 'MEMBER':
        return 0;
      case 'ADMIN':
        return 1;
      case 'OWNER':
        return 2;
    }
  };

  const checkRole = (newRole: UserRole) => {
    if (!user?.role) return false;

    const currentRolePriority = getRolePriority(currentRole);
    const memberRolePriority = getRolePriority(user.role);
    const newRolePriority = getRolePriority(newRole);

    // Disallow owner change
    if (disallowOwnerChange && user.role === 'OWNER') return false;

    // Compare current role with member role
    if (currentRolePriority < memberRolePriority) return false;

    // Compare current role with new role to be assigned
    if (currentRolePriority < newRolePriority) return false;

    return true;
  };

  return (
    <div className="grid gap-2">
      <div className="rounded border border-zinc-300/10 bg-zinc-800 p-4">
        <div className="text-xl font-semibold">{user?.display_name}</div>
        {user?.handle && <div className="text-blue-300">@{user.handle}</div>}
      </div>

      <Divider className="my-1" />

      <Select
        label={t('role')}
        placeholder={t('role-placeholder')}
        value={role}
        onChange={(role) => {
          setRole(role as UserRole);
        }}
        data={availableRoles.map((role) => ({
          value: role,
          label: t(role.toLowerCase()),
          disabled: !checkRole(role),
        }))}
        disabled={
          currentRole === 'MEMBER' ||
          availableRoles.every((role) => !checkRole(role))
        }
        withinPortal
      />

      <TextInput
        label={t('role-title')}
        placeholder={t('role-title-placeholder')}
        value={roleTitle}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          setRoleTitle(event.target.value)
        }
      />

      <Button
        fullWidth
        variant="subtle"
        onClick={async () => {
          if (!user?.id) return;

          const newUser: User = {
            ...user,
            role,
            role_title: roleTitle,
          };

          await onSubmit(wsId, newUser);
          closeAllModals();
        }}
        disabled={
          !role || (role === user?.role && roleTitle === user?.role_title)
        }
        className="bg-blue-300/10"
      >
        {user?.id ? t('common:save') : t('invite_member')}
      </Button>

      {user?.id &&
        (user.id === currentUserId ||
          (getRolePriority(currentRole) > 0 &&
            user?.role &&
            getRolePriority(user.role) <= getRolePriority(currentRole))) &&
        onDelete && (
          <>
            <Divider variant="dashed" className="my-1" />
            <div>
              <span className="text-zinc-400">
                {user.role === 'OWNER' && disallowOwnerChange
                  ? t('cannot-delete-last-owner')
                  : t('delete-member-description')}
              </span>
            </div>
            <Button
              fullWidth
              variant="subtle"
              color="red"
              onClick={async () => {
                await onDelete?.();
                closeAllModals();
              }}
              className="bg-red-300/10"
              disabled={user.role === 'OWNER' && disallowOwnerChange}
            >
              {t('common:delete')}
            </Button>
          </>
        )}
    </div>
  );
};

export default WorkspaceMemberEditForm;
