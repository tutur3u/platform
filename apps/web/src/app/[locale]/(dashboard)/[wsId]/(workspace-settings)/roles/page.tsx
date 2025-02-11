import { roleColumns } from './columns';
import { RoleForm } from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { permissions, totalPermissions } from '@/lib/permissions';
import { getPermissions } from '@/lib/workspace-helper';
import { createClient } from '@tutur3u/supabase/next/server';
import { WorkspaceRole } from '@tutur3u/types/db';
import FeatureSummary from '@tutur3u/ui/custom/feature-summary';
import { Separator } from '@tutur3u/ui/separator';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function WorkspaceRolesPage({
  params,
  searchParams,
}: Props) {
  const supabase = await createClient();
  const { wsId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_workspace_roles'))
    redirect(`/${wsId}/settings`);

  const {
    data: rawData,
    defaultData,
    count,
  } = await getRoles(wsId, await searchParams);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const t = await getTranslations();

  const data = rawData.map((role) => ({
    ...role,
    ws_id: wsId,
  }));

  const permissionsCount = totalPermissions({ wsId, user });

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-roles.plural')}
        singularTitle={t('ws-roles.singular')}
        description={t('ws-roles.description')}
        createTitle={t('ws-roles.create')}
        createDescription={t('ws-roles.create_description')}
        form={<RoleForm wsId={wsId} user={user} />}
        defaultData={defaultData}
        secondaryTriggerTitle={`${t('ws-roles.manage_default_permissions')} (${
          permissions({ wsId, user }).filter((p) =>
            defaultData.permissions.some((dp) => dp.id === p.id && dp.enabled)
          ).length
        }/${permissionsCount})`}
        secondaryTitle={t('ws-roles.default_permissions')}
        secondaryDescription={t('ws-roles.default_permissions_description')}
        showDefaultFormAsSecondary
        requireExpansion
      />
      <Separator className="my-4" />
      <CustomDataTable
        extraData={permissionsCount}
        columnGenerator={roleColumns}
        namespace="workspace-role-data-table"
        data={data}
        count={count}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </>
  );
}

async function getRoles(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  const rolesQuery = supabase
    .from('workspace_roles')
    .select(
      'id, name, permissions:workspace_role_permissions(id:permission, enabled), workspace_role_members(role_id.count()), created_at',
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (q) rolesQuery.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    rolesQuery.range(start, end).limit(parsedSize);
  }

  const defaultPermissionsQuery = supabase
    .from('workspace_default_permissions')
    .select('id:permission, enabled, created_at')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  const [rolesRes, defaultPermissionsRes] = await Promise.all([
    rolesQuery,
    defaultPermissionsQuery,
  ]);

  const { data: roleData, error, count } = rolesRes;
  const { data: defaultPermissionsData, error: defaultPermissionsError } =
    defaultPermissionsRes;

  if (error) throw error;
  if (defaultPermissionsError) throw defaultPermissionsError;

  const defaultData = {
    id: 'DEFAULT',
    name: 'DEFAULT',
    permissions: defaultPermissionsData.map((p) => ({
      id: p.id,
      enabled: p.enabled,
    })),
  };

  const data = roleData.map(
    ({ id, name, permissions, workspace_role_members, created_at }) => ({
      id,
      name,
      permissions,
      user_count: workspace_role_members?.[0]?.count,
      created_at,
    })
  );

  return { data, defaultData, count } as {
    data: WorkspaceRole[];
    defaultData: WorkspaceRole;
    count: number;
  };
}
