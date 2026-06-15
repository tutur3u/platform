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
  const enabled = enabledPermissionCount(role);
  const pct =
    permissionCount > 0 ? Math.round((enabled / permissionCount) * 100) : 0;
  const accent = isGuest
    ? 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue'
    : 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green';
  const barColor = isGuest ? 'bg-dynamic-blue' : 'bg-dynamic-green';

  return (
    <div className="rounded-xl border border-border bg-background p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
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
            onClick={() => onEdit(memberType)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            {t('common.edit')}
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
          </>
        )}
      </div>
    </div>
  );
}
