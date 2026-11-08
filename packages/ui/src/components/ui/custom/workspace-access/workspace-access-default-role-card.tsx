'use client';

import { KeyRound, Pencil, ShieldUser } from '@tuturuuu/icons';
import type { WorkspaceDefaultPermissionMemberType } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { SettingItemTab } from '../settings-item-tab';
import { SettingsSection, SettingsSectionBlock } from '../settings-section';
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

  return (
    <SettingsSection>
      <SettingItemTab
        description={
          isGuest
            ? t('ws-roles.guest_defaults_description')
            : t('ws-roles.member_defaults_description')
        }
        icon={
          isGuest ? (
            <KeyRound className="size-4" />
          ) : (
            <ShieldUser className="size-4" />
          )
        }
        title={
          isGuest ? t('ws-roles.guest_defaults') : t('ws-roles.member_defaults')
        }
      >
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
      </SettingItemTab>

      <SettingsSectionBlock className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : (
          <>
            <div>
              <div className="flex items-baseline justify-between gap-1.5 text-sm">
                <span className="font-medium tabular-nums">
                  {enabled}{' '}
                  <span className="font-normal text-muted-foreground">
                    / {permissionCount}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {t('ws-roles.permissions')}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-primary"
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
      </SettingsSectionBlock>
    </SettingsSection>
  );
}
