'use client';

import { useQuery } from '@tanstack/react-query';
import { ShieldUser, UserCheck, Users } from '@tuturuuu/icons';
import {
  getWorkspaceDefaultPermissions,
  listWorkspaceRoles,
} from '@tuturuuu/internal-api/settings';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type {
  PermissionId,
  WorkspaceDefaultPermissionMemberType,
  WorkspaceDefaultPermissionsRole,
} from '@tuturuuu/types';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { permissions, totalPermissions } from '@tuturuuu/utils/permissions';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CustomDataTable } from '@/components/custom-data-table';
import { roleColumns } from './columns';
import { RoleForm } from './form';

interface WorkspaceRolesClientProps {
  user: SupabaseUser | null;
  wsId: string;
}

function getEnabledPermissionCount({
  defaultData,
  user,
  wsId,
}: {
  defaultData?: WorkspaceDefaultPermissionsRole;
  user: SupabaseUser | null;
  wsId: string;
}) {
  if (!defaultData) return 0;

  const enabled = new Set(
    defaultData.permissions
      .filter((permission) => permission.enabled)
      .map((permission) => permission.id)
  );

  if (enabled.has('admin' as PermissionId)) {
    return totalPermissions({ wsId, user });
  }

  return permissions({ wsId, user }).filter((permission) =>
    enabled.has(permission.id)
  ).length;
}

function DefaultPermissionsPanel({
  defaultData,
  isLoading,
  memberType,
  user,
  wsId,
}: {
  defaultData?: WorkspaceDefaultPermissionsRole;
  isLoading: boolean;
  memberType: WorkspaceDefaultPermissionMemberType;
  user: SupabaseUser | null;
  wsId: string;
}) {
  const t = useTranslations();
  const enabledCount = getEnabledPermissionCount({ defaultData, user, wsId });
  const totalCount = totalPermissions({ wsId, user });
  const isGuest = memberType === 'GUEST';
  const roleData = defaultData
    ? {
        ...defaultData,
        created_at: '',
        ws_id: wsId,
      }
    : undefined;

  return (
    <div className="space-y-4 rounded-lg border bg-background p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h2 className="font-semibold text-lg">
            {isGuest
              ? t('ws-roles.guest_defaults')
              : t('ws-roles.member_defaults')}
          </h2>
          <p className="text-muted-foreground text-sm">
            {isGuest
              ? t('ws-roles.guest_defaults_description')
              : t('ws-roles.member_defaults_description')}
          </p>
        </div>
        <div className="rounded border px-2 py-1 font-semibold text-sm">
          <span className="text-dynamic-orange">{enabledCount}</span>
          <span className="mx-1 text-muted-foreground">/</span>
          <span className="text-dynamic-blue">{totalCount}</span>
        </div>
      </div>

      {isLoading || !defaultData ? (
        <div className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
          {t('common.processing')}
        </div>
      ) : (
        <RoleForm
          wsId={wsId}
          user={user}
          data={roleData}
          defaultMemberType={memberType}
          defaultName={
            isGuest
              ? t('ws-roles.guest_defaults')
              : t('ws-roles.member_defaults')
          }
          forceDefault
        />
      )}
    </div>
  );
}

export function WorkspaceRolesClient({
  user,
  wsId,
}: WorkspaceRolesClientProps) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? undefined;
  const page = searchParams.get('page') ?? '1';
  const pageSize = searchParams.get('pageSize') ?? '10';
  const permissionsCount = totalPermissions({ wsId, user });

  const rolesQuery = useQuery({
    queryKey: ['workspace-roles', wsId, { page, pageSize, q }],
    queryFn: () => listWorkspaceRoles(wsId, { page, pageSize, q }),
  });

  const memberDefaultsQuery = useQuery({
    queryKey: ['workspace-default-permissions', wsId, 'MEMBER'],
    queryFn: () => getWorkspaceDefaultPermissions(wsId, 'MEMBER'),
  });

  const guestDefaultsQuery = useQuery({
    queryKey: ['workspace-default-permissions', wsId, 'GUEST'],
    queryFn: () => getWorkspaceDefaultPermissions(wsId, 'GUEST'),
  });

  const roles = (rolesQuery.data?.data ?? []).map((role) => ({
    ...role,
    ws_id: wsId,
  }));

  return (
    <Tabs defaultValue="roles" className="space-y-4">
      <TabsList className="grid h-fit w-full grid-cols-1 md:grid-cols-3">
        <TabsTrigger value="roles">
          <Users className="mr-1 h-5 w-5" />
          {t('ws-roles.plural')}
        </TabsTrigger>
        <TabsTrigger value="member-defaults">
          <UserCheck className="mr-1 h-5 w-5" />
          {t('ws-roles.member_defaults_tab')}
        </TabsTrigger>
        <TabsTrigger value="guest-defaults">
          <ShieldUser className="mr-1 h-5 w-5" />
          {t('ws-roles.guest_defaults_tab')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="roles" className="space-y-4">
        <FeatureSummary
          pluralTitle={t('ws-roles.plural')}
          singularTitle={t('ws-roles.singular')}
          description={t('ws-roles.description')}
          createTitle={t('ws-roles.create')}
          createDescription={t('ws-roles.create_description')}
          form={<RoleForm wsId={wsId} user={user} />}
          requireExpansion
        />
        <Separator />
        {rolesQuery.isError ? (
          <div className="rounded-md border border-dashed p-4 text-destructive text-sm">
            {t('ws-roles.load_failed')}
          </div>
        ) : (
          <CustomDataTable
            extraData={permissionsCount}
            columnGenerator={roleColumns}
            namespace="workspace-role-data-table"
            data={roles}
            count={rolesQuery.data?.count ?? 0}
            defaultVisibility={{
              id: false,
              created_at: false,
            }}
          />
        )}
      </TabsContent>

      <TabsContent value="member-defaults">
        <DefaultPermissionsPanel
          defaultData={memberDefaultsQuery.data}
          isLoading={memberDefaultsQuery.isLoading}
          memberType="MEMBER"
          user={user}
          wsId={wsId}
        />
      </TabsContent>

      <TabsContent value="guest-defaults">
        <DefaultPermissionsPanel
          defaultData={guestDefaultsQuery.data}
          isLoading={guestDefaultsQuery.isLoading}
          memberType="GUEST"
          user={user}
          wsId={wsId}
        />
      </TabsContent>
    </Tabs>
  );
}
