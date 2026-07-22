'use client';

import { KeyRound, Pencil, ShieldUser } from '@tuturuuu/icons';
import type { WorkspaceDefaultPermissionMemberType } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import type { WorkspaceAccessRole } from './types';
import {
  enabledPermissionCount,
  WorkspaceAccessPermissionPreview,
} from './workspace-access-permission-preview';

export function WorkspaceAccessDefaultRoleCard({
  canManageRoles,
  isLoading,
  memberType,
  onEdit,
  permissionCount,
  permissionTitles,
  role,
}: {
  canManageRoles: boolean;
  isLoading: boolean;
  memberType: WorkspaceDefaultPermissionMemberType;
  onEdit: (memberType: WorkspaceDefaultPermissionMemberType) => void;
  permissionCount: number;
  permissionTitles: Map<string, string>;
  role?: WorkspaceAccessRole | null;
}) {
  const t = useTranslations() as (key: string) => string;
  const isGuest = memberType === 'GUEST';
  const enabled = enabledPermissionCount(role, permissionCount);
  const isAdministrator = role?.permissions.some(
    (permission) => permission.id === 'admin' && permission.enabled
  );
  const pct =
    permissionCount > 0 ? Math.round((enabled / permissionCount) * 100) : 0;
  const accent = isGuest
    ? 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue'
    : 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green';
  const barColor = isGuest ? 'bg-dynamic-blue' : 'bg-dynamic-green';

  return (
    <div className="rounded-xl border border-border bg-background p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${accent}`}
          >
            {isGuest ? (
              <KeyRound className="h-5 w-5" />
            ) : (
              <ShieldUser className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-base">
              {isGuest
                ? t('ws-roles.guest_defaults')
                : t('ws-roles.member_defaults')}
            </div>
            <p className="mt-0.5 max-w-md text-muted-foreground text-sm">
              {isGuest
                ? t('ws-roles.guest_defaults_description')
                : t('ws-roles.member_defaults_description')}
            </p>
          </div>
        </div>
        {canManageRoles ? (
          <Button
            variant="outline"
            size="sm"
            className="size-9 shrink-0 px-0 sm:w-auto sm:px-3"
            onClick={() => onEdit(memberType)}
          >
            <Pencil className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('common.edit')}</span>
            <span className="sr-only sm:hidden">{t('common.edit')}</span>
          </Button>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {isLoading ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : (
          <>
            <div>
              <div className="flex items-baseline justify-between gap-1.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-bold text-2xl tabular-nums">
                    {enabled}
                  </span>
                  <span className="text-base text-muted-foreground">
                    / {permissionCount}
                  </span>
                </div>
                <span className="text-muted-foreground text-sm">
                  {t('ws-roles.permissions')}
                </span>
              </div>
              <div className="mt-2 h-1.5 max-w-md overflow-hidden rounded-full bg-foreground/10">
                <div
                  className={`h-full rounded-full ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <WorkspaceAccessPermissionPreview
                emptyLabel={t('ws-members.no_permissions')}
                permissionTitles={permissionTitles}
                role={role}
              />
            </div>
            {isAdministrator ? (
              <p className="text-dynamic-green text-sm">
                {t('ws-members.admin_has_all_permissions')}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
