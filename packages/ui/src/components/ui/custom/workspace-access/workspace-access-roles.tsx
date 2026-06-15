'use client';

import { Pencil, Plus, ShieldCheck, Trash2, Users } from '@tuturuuu/icons';
import type { InternalApiEnhancedWorkspaceMember } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg">{labels.accessLevelsLabel}</h2>
          <p className="text-muted-foreground text-sm">
            {t('ws-roles.description')}
          </p>
        </div>
        {canManageRoles ? (
          <Button onClick={onCreateRole}>
            <Plus className="mr-2 h-4 w-4" />
            {t('ws-roles.create')}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      ) : roles.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-border border-dashed p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-dynamic-purple/10 text-dynamic-purple">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="font-medium">{labels.rolesEmptyTitle}</div>
          <div className="max-w-sm text-muted-foreground text-sm">
            {labels.rolesEmptyDescription}
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {roles.map((role) => {
            const assignedMembers =
              role.members && role.members.length > 0
                ? role.members
                : assignedMembersForRole(role.id, members);
            const enabled = enabledPermissionCount(role);
            const pct =
              permissionCount > 0
                ? Math.round((enabled / permissionCount) * 100)
                : 0;

            return (
              <div
                key={role.id}
                className="rounded-xl border border-border bg-background p-5 transition-colors hover:border-foreground/20"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-base">
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
                      <div className="mt-2 max-w-xs">
                        <div className="flex items-center justify-between text-muted-foreground text-xs">
                          <span>{t('ws-roles.permissions')}</span>
                          <span className="tabular-nums">
                            {enabled}/{permissionCount}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                          <div
                            className="h-full rounded-full bg-dynamic-purple"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {canManageRoles ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEditRole(role)}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        {t('common.edit')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDeleteRole(role)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('common.delete')}
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <WorkspaceAccessPermissionPreview
                    emptyLabel={t('ws-members.no_permissions')}
                    permissionTitles={permissionTitles}
                    role={role}
                  />
                </div>

                {assignedMembers.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-border border-t pt-3">
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
