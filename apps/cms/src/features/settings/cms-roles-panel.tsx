'use client';

import { Pencil, Trash2 } from '@tuturuuu/icons';
import type { WorkspaceRoleDetails } from '@tuturuuu/internal-api';
import type {
  InternalApiEnhancedWorkspaceMember,
  WorkspaceDefaultPermissionMemberType,
} from '@tuturuuu/types';
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

function DefaultAccessCard({
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
  role: WorkspaceRoleDetails | undefined;
}) {
  const t = useTranslations();
  const tSettings = useTranslations('external-projects.settings');
  const enabledCount =
    role?.permissions.filter((permission) => permission.enabled).length ?? 0;
  const title =
    memberType === 'GUEST'
      ? tSettings('guest_defaults_title')
      : tSettings('member_defaults_title');
  const description =
    memberType === 'GUEST'
      ? tSettings('guest_defaults_description')
      : tSettings('member_defaults_description');

  return (
    <Card className="border-border/70 bg-card/95 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
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
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : (
          <>
            <div className="font-semibold text-2xl">
              {enabledCount}
              <span className="ml-1 font-normal text-base text-muted-foreground">
                / {permissionCount}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <PermissionBadges
                permissionTitles={permissionTitles}
                permissions={role?.permissions ?? []}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function CmsRolesPanel({
  canManageRoles,
  filteredRoles,
  guestDefaultRole,
  isGuestDefaultRoleLoading,
  isMemberDefaultRoleLoading,
  isRolesLoading,
  memberDefaultRole,
  members,
  onDeleteRole,
  onEditDefaultRole,
  onEditRole,
  permissionCount,
  permissionTitles,
}: {
  canManageRoles: boolean;
  filteredRoles: WorkspaceRoleDetails[];
  guestDefaultRole: WorkspaceRoleDetails | undefined;
  isGuestDefaultRoleLoading: boolean;
  isMemberDefaultRoleLoading: boolean;
  isRolesLoading: boolean;
  memberDefaultRole: WorkspaceRoleDetails | undefined;
  members: InternalApiEnhancedWorkspaceMember[];
  onDeleteRole: (role: WorkspaceRoleDetails) => void;
  onEditDefaultRole: (memberType: WorkspaceDefaultPermissionMemberType) => void;
  onEditRole: (role: WorkspaceRoleDetails) => void;
  permissionCount: number;
  permissionTitles: Map<string, string>;
}) {
  const t = useTranslations();
  const tRoles = useTranslations('ws-roles');
  const tSettings = useTranslations('external-projects.settings');

  return (
    <div className="space-y-4">
      <Card className="border-border/70 bg-card/95 shadow-none">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>{tSettings('advanced_access_title')}</CardTitle>
              <CardDescription>
                {tSettings('advanced_access_description')}
              </CardDescription>
            </div>
            <Badge variant="outline" className="rounded-full">
              {filteredRoles.length} {tSettings('access_levels_label')}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <DefaultAccessCard
          canManageRoles={canManageRoles}
          isLoading={isMemberDefaultRoleLoading}
          memberType="MEMBER"
          onEdit={onEditDefaultRole}
          permissionCount={permissionCount}
          permissionTitles={permissionTitles}
          role={memberDefaultRole}
        />
        <DefaultAccessCard
          canManageRoles={canManageRoles}
          isLoading={isGuestDefaultRoleLoading}
          memberType="GUEST"
          onEdit={onEditDefaultRole}
          permissionCount={permissionCount}
          permissionTitles={permissionTitles}
          role={guestDefaultRole}
        />
      </div>

      <div className="grid gap-4">
        {isRolesLoading ? (
          <>
            <Skeleton className="h-36 rounded-2xl" />
            <Skeleton className="h-36 rounded-2xl" />
          </>
        ) : filteredRoles.length === 0 ? (
          <Card className="border-border/70 bg-card/95 shadow-none">
            <CardContent className="flex min-h-[180px] flex-col items-center justify-center gap-2 text-center text-muted-foreground text-sm">
              <div className="font-medium text-foreground">
                {tSettings('roles_empty_title')}
              </div>
              <div>{tSettings('roles_empty_description')}</div>
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
