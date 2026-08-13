'use client';

import { Check, ChevronDown, Plus, ShieldUser, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
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
    roleId: null | string;
    userId?: null | string;
  }) => void;
  role?: null | Pick<WorkspaceAccessRole, 'id' | 'name'>;
  roles: Array<Pick<WorkspaceAccessRole, 'id' | 'name'>>;
  userId?: null | string;
};

export function WorkspaceAccessInvitationRoleMenu({
  email,
  isMutating,
  onUpdate,
  role,
  roles,
  userId,
}: Props) {
  const t = useTranslations();
  const updateRole = (roleId: null | string) =>
    onUpdate({ email, roleId, userId });

  return (
    <div className="space-y-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`h-7 max-w-full rounded-full px-2.5 text-xs active:scale-[0.98] ${role ? 'border-dynamic-purple/40 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/15 hover:text-dynamic-purple' : 'border-dashed text-muted-foreground hover:text-foreground'}`}
            disabled={isMutating}
          >
            {role ? (
              <ShieldUser className="size-3.5 shrink-0" />
            ) : (
              <Plus className="size-3.5 shrink-0" />
            )}
            <span className="truncate">
              {role?.name ?? t('ws-members.assign_invitation_role')}
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
          <DropdownMenuItem onSelect={() => updateRole(null)}>
            <X className="size-4" />
            <span className="flex-1">{t('ws-members.no_role_assigned')}</span>
            {!role ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
          {roles.map((option) => (
            <DropdownMenuItem
              key={option.id}
              onSelect={() => updateRole(option.id)}
            >
              <ShieldUser className="size-4" />
              <span className="flex-1 truncate">{option.name}</span>
              {role?.id === option.id ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <p className="text-muted-foreground text-xs leading-4">
        {t('ws-members.invitation_role_helper')}
      </p>
    </div>
  );
}
