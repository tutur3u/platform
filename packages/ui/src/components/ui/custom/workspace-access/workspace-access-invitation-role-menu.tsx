'use client';

import { ChevronDown, Plus, ShieldUser, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import type { WorkspaceAccessRole } from './types';

type Props = {
  email?: null | string;
  isMutating: boolean;
  onUpdate: (payload: {
    email?: null | string;
    roleIds: string[];
    userId?: null | string;
  }) => void;
  assignedRoles: Array<Pick<WorkspaceAccessRole, 'id' | 'name'>>;
  roles: Array<Pick<WorkspaceAccessRole, 'id' | 'name'>>;
  userId?: null | string;
};

export function WorkspaceAccessInvitationRoleMenu({
  email,
  isMutating,
  onUpdate,
  assignedRoles,
  roles,
  userId,
}: Props) {
  const t = useTranslations();
  const assignedRoleIds = new Set(assignedRoles.map((role) => role.id));
  const updateRole = (roleId: string) => {
    const roleIds = assignedRoleIds.has(roleId)
      ? assignedRoles
          .filter((role) => role.id !== roleId)
          .map((role) => role.id)
      : [...assignedRoles.map((role) => role.id), roleId];
    onUpdate({ email, roleIds, userId });
  };

  return (
    <div className="space-y-2">
      {assignedRoles.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {assignedRoles.map((role) => (
            <Badge
              key={role.id}
              className="h-6 gap-1 border-dynamic-purple/35 bg-dynamic-purple/10 px-2 text-dynamic-purple text-xs"
            >
              <ShieldUser className="size-3" />
              {role.name}
            </Badge>
          ))}
        </div>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`h-7 max-w-full rounded-full px-2.5 text-xs active:scale-[0.98] ${assignedRoles.length > 0 ? 'border-dynamic-purple/40 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/15 hover:text-dynamic-purple' : 'border-dashed text-muted-foreground hover:text-foreground'}`}
            disabled={isMutating}
          >
            {assignedRoles.length > 0 ? (
              <ShieldUser className="size-3.5 shrink-0" />
            ) : (
              <Plus className="size-3.5 shrink-0" />
            )}
            <span className="truncate">
              {assignedRoles.length > 0
                ? t('ws-members.roles_selected', {
                    count: assignedRoles.length,
                  })
                : t('ws-members.assign_invitation_role')}
            </span>
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="flex items-center gap-2">
            <ShieldUser className="size-4 text-muted-foreground" />
            {t('ws-members.invitation_role')}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {roles.map((option) => (
            <DropdownMenuCheckboxItem
              checked={assignedRoleIds.has(option.id)}
              key={option.id}
              onSelect={(event) => {
                event.preventDefault();
                updateRole(option.id);
              }}
            >
              <ShieldUser className="size-4" />
              <span className="flex-1 truncate">{option.name}</span>
            </DropdownMenuCheckboxItem>
          ))}
          {assignedRoles.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => onUpdate({ email, roleIds: [], userId })}
              >
                <X className="size-4" />
                {t('ws-members.clear_all_roles')}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <p className="text-muted-foreground text-xs leading-4">
        {t('ws-members.invitation_role_helper')}
      </p>
    </div>
  );
}
