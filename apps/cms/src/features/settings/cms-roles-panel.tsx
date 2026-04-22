'use client';

import { Pencil, Trash2 } from '@tuturuuu/icons';
import type { WorkspaceRoleDetails } from '@tuturuuu/internal-api';
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
import { getAssignedMembersForRole } from './cms-members-shared';

function PermissionBadges({
  permissionTitles,
  permissions,
}: {
  permissionTitles: Map<string, string>;
  permissions: WorkspaceRoleDetails['permissions'];
}) {
  const tSettings = useTranslations('external-projects.settings');
  const enabledPermissions = permissions.filter(
    (permission) => permission.enabled
  );

  if (enabledPermissions.length === 0) {
    return (
      <Badge variant="outline" className="rounded-full">
        {tSettings('no_roles_label')}
      </Badge>
    );
  }

  return enabledPermissions.slice(0, 4).map((permission) => (
    <Badge key={permission.id} variant="secondary" className="rounded-full">
      {permissionTitles.get(permission.id) ?? permission.id}
    </Badge>
  ));
}

export function CmsRolesPanel({
  canManageRoles,
  defaultRole,
  filteredRoles,
  isDefaultRoleLoading,
  isRolesLoading,
  members,
  onDeleteRole,
  onEditRole,
  permissionCount,
  permissionTitles,
}: {
  canManageRoles: boolean;
  defaultRole: WorkspaceRoleDetails | undefined;
  filteredRoles: WorkspaceRoleDetails[];
  isDefaultRoleLoading: boolean;
  isRolesLoading: boolean;
  members: InternalApiEnhancedWorkspaceMember[];
  onDeleteRole: (role: WorkspaceRoleDetails) => void;
  onEditRole: (role: WorkspaceRoleDetails) => void;
  permissionCount: number;
  permissionTitles: Map<string, string>;
}) {
  const t = useTranslations();
  const tRoles = useTranslations('ws-roles');
  const tSettings = useTranslations('external-projects.settings');

  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <Card className="border-border/70 bg-card/95 shadow-none">
        <CardHeader>
          <CardTitle>{tRoles('default_permissions')}</CardTitle>
          <CardDescription>
            {tRoles('default_permissions_description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isDefaultRoleLoading ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : (
            <>
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <div className="text-muted-foreground text-sm">
                  {tRoles('permissions')}
                </div>
                <div className="mt-2 font-semibold text-2xl">
                  {
                    (defaultRole?.permissions ?? []).filter(
                      (permission) => permission.enabled
                    ).length
                  }
                  <span className="ml-1 font-normal text-base text-muted-foreground">
                    / {permissionCount}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <PermissionBadges
                  permissionTitles={permissionTitles}
                  permissions={defaultRole?.permissions ?? []}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {isRolesLoading ? (
          <>
            <Skeleton className="h-36 rounded-2xl" />
            <Skeleton className="h-36 rounded-2xl" />
          </>
        ) : filteredRoles.length === 0 ? (
          <Card className="border-border/70 bg-card/95 shadow-none">
            <CardContent className="flex min-h-[180px] items-center justify-center text-muted-foreground text-sm">
              {tRoles('plural')} 0
            </CardContent>
          </Card>
        ) : (
          filteredRoles.map((role) => {
            const assignedMembers = getAssignedMembersForRole(role.id, members);

            return (
              <Card
                key={role.id}
                className="border-border/70 bg-card/95 shadow-none"
              >
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="font-medium text-lg">{role.name}</div>
                      <div className="flex flex-wrap gap-2 text-muted-foreground text-sm">
                        <span>
                          {tRoles('members')}: {assignedMembers.length}
                        </span>
                        <span>
                          {tRoles('permissions')}:{' '}
                          {role.permissions.filter(
                            (permission) => permission.enabled
                          ).length || 0}
                          /{permissionCount}
                        </span>
                      </div>
                    </div>

                    {canManageRoles ? (
                      <div className="flex gap-2">
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
                    <PermissionBadges
                      permissionTitles={permissionTitles}
                      permissions={role.permissions}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {assignedMembers.length === 0 ? (
                      <Badge variant="outline" className="rounded-full">
                        {tSettings('no_roles_label')}
                      </Badge>
                    ) : (
                      assignedMembers.slice(0, 5).map((member) => (
                        <Badge
                          key={`${role.id}-${member.id ?? member.email}`}
                          variant="outline"
                          className="rounded-full"
                        >
                          {member.display_name ||
                            member.email ||
                            member.handle ||
                            t('common.unknown')}
                        </Badge>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
