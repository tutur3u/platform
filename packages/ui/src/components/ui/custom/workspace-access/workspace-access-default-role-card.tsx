'use client';

import { Pencil } from '@tuturuuu/icons';
import type { WorkspaceDefaultPermissionMemberType } from '@tuturuuu/types';
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

  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">
              {isGuest
                ? t('ws-roles.guest_defaults')
                : t('ws-roles.member_defaults')}
            </CardTitle>
            <CardDescription>
              {isGuest
                ? t('ws-roles.guest_defaults_description')
                : t('ws-roles.member_defaults_description')}
            </CardDescription>
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
          <Skeleton className="h-24 rounded-lg" />
        ) : (
          <>
            <div className="font-semibold text-2xl tabular-nums">
              {enabledPermissionCount(role)}
              <span className="ml-1 font-normal text-base text-muted-foreground">
                / {permissionCount}
              </span>
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
      </CardContent>
    </Card>
  );
}
