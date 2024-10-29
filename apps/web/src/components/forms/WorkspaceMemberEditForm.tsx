'use client';

import { User, UserRole } from '@/types/primitives/User';
import { getInitials } from '@/utils/name-helper';
import { Avatar, Button, Divider, Select, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import { useTranslations } from 'next-intl';
import { ChangeEvent, useState } from 'react';

interface Props {
  currentRole: UserRole;
  wsId: string;
  user?: User;
  onSubmit: (wsId: string, user: User) => Promise<void>;
  onDelete?: () => Promise<void>;
  disallowOwnerChange?: boolean;
}

const WorkspaceMemberEditForm = ({
  currentRole,
  wsId,
  user,
  onSubmit,
  onDelete,
  disallowOwnerChange,
}: Props) => {
  const t = useTranslations();

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
    return currentRolePriority >= newRolePriority;
  };

  return (
    <div className="grid gap-2">
      <div className="border-border flex gap-2 rounded border bg-zinc-500/5 p-2 dark:border-zinc-300/10 dark:bg-zinc-300/5">
        <Avatar
          alt="Avatar"
          src={user?.avatar_url}
          size="2xl"
          color="blue"
          className="aspect-square w-full max-w-[3.5rem] rounded-full text-xl"
        >
          {getInitials(user?.display_name || '?')}
        </Avatar>

        <div>
          <div className="text-xl font-semibold">{user?.display_name}</div>
          {user?.handle && (
            <div className="font-semibold text-blue-600 dark:text-blue-300">
              @{user.handle}
            </div>
          )}
        </div>
      </div>

      <Divider className="my-1" />

      <Select
        label={t('ws-members.role')}
        placeholder={t('ws-members.role-placeholder')}
        value={role}
        onChange={(role) => {
          setRole(role as UserRole);
        }}
        data={availableRoles.map((role) => ({
          value: role,
          label: t(role.toLowerCase() as any),
          disabled: !checkRole(role),
        }))}
        disabled={
          currentRole === 'MEMBER' ||
          availableRoles.every((role) => !checkRole(role))
        }
      />

      <TextInput
        label={t('ws-members.role-title')}
        placeholder={t('ws-members.role-title-placeholder')}
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
        className="bg-blue-500/10 dark:bg-blue-300/10"
      >
        {user?.id ? t('common.save') : t('ws-members.invite_member')}
      </Button>

      {user?.id &&
        getRolePriority(currentRole) > 0 &&
        user?.role &&
        getRolePriority(user.role) <= getRolePriority(currentRole) &&
        onDelete && (
          <>
            <Divider variant="dashed" className="my-1" />
            <div>
              <span className="text-foreground/80">
                {user.role === 'OWNER' && disallowOwnerChange
                  ? t('ws-members.cannot-delete-last-owner')
                  : t('ws-members.delete-member-description')}
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
              className="bg-red-500/10 dark:bg-red-300/10"
              disabled={user.role === 'OWNER' && disallowOwnerChange}
            >
              {t('common.delete')}
            </Button>
          </>
        )}
    </div>
  );
};

export default WorkspaceMemberEditForm;
