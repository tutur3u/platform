'use client';

import { Pencil, Plus, Trash2, Users } from '@tuturuuu/icons';
import type { InternalApiEnhancedWorkspaceMember } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import {
  SettingsSection,
  SettingsSectionBlock,
  SettingsSectionMessage,
} from '../settings-section';
import { getMemberDisplayName } from './member-filter-utils';
import type { WorkspaceAccessLabels, WorkspaceAccessRole } from './types';
import {
  enabledPermissionCount,
  WorkspaceAccessPermissionPreview,
} from './workspace-access-permission-preview';

function assignedMembersForRole(
  roleId: string,
  members: InternalApiEnhancedWorkspaceMember[]
) {
  return members.filter((member) =>
    member.roles.some((role) => role.id === roleId)
  );
}

export function WorkspaceAccessRoles({
  canManageRoles,
  isLoading,
  members,
  labels,
  onCreateRole,
  onDeleteRole,
  onEditRole,
  permissionCount,
  permissionTitles,
  roles,
}: {
  canManageRoles: boolean;
  isLoading: boolean;
  labels: WorkspaceAccessLabels;
  members: InternalApiEnhancedWorkspaceMember[];
  onCreateRole: () => void;
  onDeleteRole: (role: WorkspaceAccessRole) => void;
  onEditRole: (role: WorkspaceAccessRole) => void;
  permissionCount: number;
  permissionTitles: Map<string, string>;
  roles: WorkspaceAccessRole[];
}) {
  const t = useTranslations() as (key: string) => string;

  return (
    <SettingsSection
      action={
        canManageRoles ? (
          <Button
            onClick={onCreateRole}
            className="size-9 shrink-0 px-0 sm:w-auto sm:px-4"
          >
            <Plus className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('ws-roles.create')}</span>
            <span className="sr-only sm:hidden">{t('ws-roles.create')}</span>
          </Button>
        ) : null
      }
      description={t('ws-roles.description')}
      title={labels.accessLevelsLabel}
    >
      {isLoading ? (
        ['first', 'second'].map((row) => (
          <SettingsSectionBlock key={row}>
            <Skeleton className="h-28 rounded-lg" />
          </SettingsSectionBlock>
        ))
      ) : roles.length === 0 ? (
        <SettingsSectionMessage>
          <div className="space-y-1">
            <div className="font-medium text-foreground">
              {labels.rolesEmptyTitle}
            </div>
            <div>{labels.rolesEmptyDescription}</div>
          </div>
        </SettingsSectionMessage>
      ) : (
        roles.map((role) => {
          const assignedMembers =
            role.members && role.members.length > 0
              ? role.members
              : assignedMembersForRole(role.id, members);
          const enabled = enabledPermissionCount(role, permissionCount);
          const isAdministrator = role.permissions.some(
            (permission) => permission.id === 'admin' && permission.enabled
          );
          const pct =
            permissionCount > 0
              ? Math.round((enabled / permissionCount) * 100)
              : 0;

          return (
            <SettingsSectionBlock key={role.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-sm">
                      {role.name}
                    </span>
                    <Badge
                      variant="outline"
                      className="h-5 gap-1 px-1.5 text-xs"
                    >
                      <Users className="h-3 w-3" />
                      {assignedMembers.length}
                    </Badge>
                  </div>
                  <div className="mt-2 w-56 max-w-full">
                    <div className="flex items-center justify-between text-muted-foreground text-xs">
                      <span>{t('ws-roles.permissions')}</span>
                      <span className="tabular-nums">
                        {enabled}/{permissionCount}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {canManageRoles ? (
                  <div className="flex shrink-0 gap-1.5 sm:gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="size-8 px-0 sm:w-auto sm:px-3"
                      onClick={() => onEditRole(role)}
                    >
                      <Pencil className="size-3.5 sm:mr-2" />
                      <span className="hidden sm:inline">
                        {t('common.edit')}
                      </span>
                      <span className="sr-only sm:hidden">
                        {t('common.edit')}
                      </span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="size-8 px-0 sm:w-auto sm:px-3"
                      onClick={() => onDeleteRole(role)}
                    >
                      <Trash2 className="size-3.5 sm:mr-2" />
                      <span className="hidden sm:inline">
                        {t('common.delete')}
                      </span>
                      <span className="sr-only sm:hidden">
                        {t('common.delete')}
                      </span>
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <WorkspaceAccessPermissionPreview
                  emptyLabel={t('ws-members.no_permissions')}
                  permissionTitles={permissionTitles}
                  role={role}
                />
              </div>
              {isAdministrator ? (
                <p className="mt-2 text-dynamic-green text-sm">
                  {t('ws-members.admin_has_all_permissions')}
                </p>
              ) : null}

              {assignedMembers.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {assignedMembers.slice(0, 6).map((member) => (
                    <Badge
                      key={`${role.id}-${member.id}`}
                      variant="secondary"
                      className="rounded-full text-xs"
                    >
                      {getMemberDisplayName(
                        member as InternalApiEnhancedWorkspaceMember,
                        t('common.unknown')
                      )}
                    </Badge>
                  ))}
                  {assignedMembers.length > 6 ? (
                    <Badge variant="outline" className="rounded-full text-xs">
                      +{assignedMembers.length - 6}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </SettingsSectionBlock>
          );
        })
      )}
    </SettingsSection>
  );
}
