import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { WorkspaceUserField } from '@tuturuuu/types/primitives/WorkspaceUserField';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuditLogTable } from './audit-log-table';
import ExportDialogContent from './export-dialog-content';
import UserForm from './form';
import ImportDialogContent from './import-dialog-content';
import { WorkspaceUsersTable } from './workspace-users-table';

export const metadata: Metadata = {
  title: 'Database',
  description: 'Manage Database in the Users area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams: Promise<{
    tab?: string;
  }>;
}

export default async function WorkspaceUsersPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { locale, wsId: id } = await params;
  const sp = await searchParams;

  const workspace = await getWorkspace(id);
  const wsId = workspace.id;

  const { containsPermission } = await getPermissions({
    wsId,
  });

  const hasPrivateInfo = containsPermission('view_users_private_info');
  const hasPublicInfo = containsPermission('view_users_public_info');
  const canCreateUsers = containsPermission('create_users');
  const canUpdateUsers = containsPermission('update_users');
  const canDeleteUsers = containsPermission('delete_users');
  const canCheckUserAttendance = containsPermission('check_user_attendance');
  const canExportUsers = containsPermission('export_users_data');

  // User must have at least one permission to view users
  if (!hasPrivateInfo && !hasPublicInfo) {
    notFound();
  }

  // Fetch initial data for hydration (first page only)
  const { data: initialUsers, count } = await getInitialData(wsId, {
    hasPrivateInfo,
    hasPublicInfo,
    canCheckUserAttendance,
  });

  const { data: extraFields } = await getUserFields(wsId);

  // Add href for navigation
  const users = initialUsers.map((u) => ({
    ...u,
    href: `/${wsId}/users/database/${u.id}`,
  }));

  const permissions = {
    hasPrivateInfo,
    hasPublicInfo,
    canCreateUsers,
    canUpdateUsers,
    canDeleteUsers,
    canCheckUserAttendance,
  };

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-users.plural')}
        singularTitle={t('ws-users.singular')}
        description={t('ws-users.description')}
        createTitle={t('ws-users.create')}
        createDescription={t('ws-users.create_description')}
        form={
          canCreateUsers ? (
            <UserForm
              wsId={wsId}
              canCreateUsers={canCreateUsers}
              canUpdateUsers={canUpdateUsers}
            />
          ) : undefined
        }
      />
      <Separator className="my-4" />
      <Tabs defaultValue={sp.tab || 'users'} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="users">{t('ws-users.plural')}</TabsTrigger>
          <TabsTrigger value="audit-log">{t('ws-users.audit_log')}</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <WorkspaceUsersTable
            wsId={wsId}
            locale={locale}
            extraFields={extraFields}
            permissions={permissions}
            initialData={{
              data: users,
              count: count,
            }}
            toolbarImportContent={
              canExportUsers && <ImportDialogContent wsId={wsId} />
            }
            toolbarExportContent={
              canExportUsers && (
                <ExportDialogContent
                  wsId={wsId}
                  exportType="users"
                  showDataTypeSelector
                />
              )
            }
          />
        </TabsContent>
        <TabsContent value="audit-log">
          <AuditLogTable wsId={wsId} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/**
 * Fetches initial page of users for SSR hydration
 */
async function getInitialData(
  wsId: string,
  permissions: {
    hasPrivateInfo: boolean;
    hasPublicInfo: boolean;
    canCheckUserAttendance: boolean;
  }
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .rpc(
      'get_workspace_users',
      {
        _ws_id: wsId,
        included_groups: [],
        excluded_groups: [],
        search_query: '',
        include_archived: false,
      },
      {
        count: 'exact',
      }
    )
    .select('*')
    .order('full_name', { ascending: true, nullsFirst: false })
    .range(0, 9);

  const { data, error, count } = await queryBuilder;

  if (error) {
    console.error('Error fetching initial users:', error);
    return { data: [], count: 0 };
  }

  // Enrich each user with guest status
  const withGuest = await Promise.all(
    (data as unknown as WorkspaceUser[]).map(async (u) => {
      const { data: isGuest } = await supabase.rpc('is_user_guest', {
        user_uuid: u.id,
      });

      // Sanitize data based on permissions
      const sanitized: Record<string, unknown> = {
        ...u,
        is_guest: Boolean(isGuest),
      };

      // Remove private fields if user doesn't have permission
      if (!permissions.hasPrivateInfo) {
        delete sanitized.email;
        delete sanitized.phone;
        delete sanitized.birthday;
        delete sanitized.gender;
        delete sanitized.ethnicity;
        delete sanitized.guardian;
        delete sanitized.national_id;
        delete sanitized.address;
        delete sanitized.note;
      }

      // Remove public fields if user doesn't have permission
      if (!permissions.hasPublicInfo) {
        delete sanitized.avatar_url;
        delete sanitized.full_name;
        delete sanitized.display_name;
        delete sanitized.group_count;
        delete sanitized.linked_users;
        delete sanitized.created_at;
        delete sanitized.updated_at;
      }

      if (!permissions.canCheckUserAttendance) {
        delete sanitized.attendance_count;
      }

      return sanitized as unknown as WorkspaceUser & { is_guest?: boolean };
    })
  );

  return {
    data: withGuest,
    count: count ?? 0,
  };
}

async function getUserFields(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_user_fields')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceUserField[]; count: number };
}
