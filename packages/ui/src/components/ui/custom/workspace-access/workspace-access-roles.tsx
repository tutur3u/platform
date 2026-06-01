'use client';

import { Pencil, Plus, Trash2 } from '@tuturuuu/icons';
import type { InternalApiEnhancedWorkspaceMember } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
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
      <Card className="shadow-none">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>{t('ws-roles.plural')}</CardTitle>
              <CardDescription>{t('ws-roles.description')}</CardDescription>
            </div>
            {canManageRoles ? (
              <Button onClick={onCreateRole}>
                <Plus className="mr-2 h-4 w-4" />
                {t('ws-roles.create')}
              </Button>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
        </div>
      ) : roles.length === 0 ? (
        <Card className="shadow-none">
          <CardContent className="flex min-h-44 flex-col items-center justify-center gap-2 text-center">
            <div className="font-medium">{labels.rolesEmptyTitle}</div>
            <div className="text-muted-foreground text-sm">
              {labels.rolesEmptyDescription}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {roles.map((role) => {
            const assignedMembers =
              role.members && role.members.length > 0
                ? role.members
                : assignedMembersForRole(role.id, members);

            return (
              <Card key={role.id} className="shadow-none">
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="font-medium text-lg">{role.name}</div>
                      <div className="flex flex-wrap gap-2 text-muted-foreground text-sm">
                        <span>
                          {t('ws-roles.members')}: {assignedMembers.length}
                        </span>
                        <span>
                          {t('ws-roles.permissions')}:{' '}
                          {enabledPermissionCount(role)}/{permissionCount}
                        </span>
                      </div>
                    </div>

                    {canManageRoles ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => onEditRole(role)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          {t('common.edit')}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => onDeleteRole(role)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('common.delete')}
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <WorkspaceAccessPermissionPreview
                      emptyLabel={t('ws-members.no_permissions')}
                      permissionTitles={permissionTitles}
                      role={role}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {assignedMembers.length === 0 ? (
                      <Badge variant="outline" className="rounded-full">
                        {labels.noRolesLabel}
                      </Badge>
                    ) : (
                      assignedMembers.slice(0, 6).map((member) => (
                        <Badge
                          key={`${role.id}-${member.id}`}
                          variant="outline"
                          className="rounded-full"
                        >
                          {getMemberDisplayName(
                            member as InternalApiEnhancedWorkspaceMember,
                            t('common.unknown')
                          )}
                        </Badge>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
