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
import { z } from 'zod';
import { CustomDataTable } from '@/components/custom-data-table';
import { AuditLogTable } from './audit-log-table';
import { getUserColumns } from './columns';
import ExportDialogContent from './export-dialog-content';
import Filters from './filters';
import UserForm from './form';
import ImportDialogContent from './import-dialog-content';

export const metadata: Metadata = {
  title: 'Database',
  description: 'Manage Database in the Users area of your Tuturuuu workspace.',
};

interface SearchParams {
  q?: string;
  page?: number;
  pageSize?: number;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
  tab?: string;
}

const SearchParamsSchema = z.object({
  q: z.string().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  includedGroups: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : val ? [val] : []))
    .default([]),
  excludedGroups: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : val ? [val] : []))
    .default([]),
  tab: z.enum(['users', 'audit-log']).default('users'),
});

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspaceUsersPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { locale, wsId: id } = await params;

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

  // User must have at least one permission to view users
  if (!hasPrivateInfo && !hasPublicInfo) {
    notFound();
  }

  const sp = SearchParamsSchema.parse(await searchParams);
  const { data, count } = await getData(wsId, sp, {
    hasPrivateInfo,
    hasPublicInfo,
    canCheckUserAttendance,
  });
  const { data: extraFields } = await getUserFields(wsId);

  // Add href for navigation
  const users = data.map((u) => ({
    ...u,
    href: `/${wsId}/users/database/${u.id}`,
  }));

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
          <CustomDataTable
            data={users}
            namespace="user-data-table"
            columnGenerator={getUserColumns}
            extraColumns={extraFields}
            extraData={{
              locale,
              wsId,
              hasPrivateInfo,
              hasPublicInfo,
              canCreateUsers,
              canUpdateUsers,
              canDeleteUsers,
              canCheckUserAttendance,
            }}
            count={count}
            filters={<Filters wsId={wsId} searchParams={sp} />}
            toolbarImportContent={
              containsPermission('export_users_data') && (
                <ImportDialogContent wsId={wsId} />
              )
            }
            toolbarExportContent={
              containsPermission('export_users_data') && (
                <ExportDialogContent
                  wsId={wsId}
                  exportType="users"
                  searchParams={sp}
                />
              )
            }
            defaultVisibility={{
              id: false,
              gender: false,
              display_name: false,
              ethnicity: false,
              guardian: false,
              address: false,
              national_id: false,
              note: false,
              linked_users: false,
              group_count: false,
              created_at: false,
              updated_at: false,
              avatar_url: false,

              // Extra columns
              ...Object.fromEntries(
                extraFields.map((field) => [field.id, false])
              ),
            }}
          />
        </TabsContent>
        <TabsContent value="audit-log">
          <AuditLogTable wsId={wsId} page={sp.page} pageSize={sp.pageSize} />
        </TabsContent>
      </Tabs>
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = 1,
    pageSize = 10,
    includedGroups = [],
    excludedGroups = [],
    retry = true,
  }: SearchParams & { retry?: boolean } = {},
  permissions?: {
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
        included_groups: Array.isArray(includedGroups)
          ? includedGroups
          : [includedGroups],
        excluded_groups: Array.isArray(excludedGroups)
          ? excludedGroups
          : [excludedGroups],
        search_query: q || '',
      },
      {
        count: 'exact',
      }
    )
    .select('*')
    .order('full_name', { ascending: true, nullsFirst: false });

  if (page && pageSize) {
    const start = (page - 1) * pageSize;
    const end = page * pageSize;
    queryBuilder.range(start, end).limit(pageSize);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    if (!retry) throw error;
    return getData(
      wsId,
      {
        q,
        page,
        pageSize,
        includedGroups,
        excludedGroups,
        retry: false,
      },
      permissions
    );
  }

  // Enrich each user with guest status via RPC (page size is small, acceptable)
  const withGuest = await Promise.all(
    (data as unknown as WorkspaceUser[]).map(async (u) => {
      const { data: isGuest } = await supabase.rpc('is_user_guest', {
        user_uuid: u.id,
      });

      // Sanitize data based on permissions
      const sanitized: any = { ...u, is_guest: Boolean(isGuest) };

      // Remove private fields if user doesn't have permission
      if (!permissions?.hasPrivateInfo) {
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
      if (!permissions?.hasPublicInfo) {
        delete sanitized.avatar_url;
        delete sanitized.full_name;
        delete sanitized.display_name;
        delete sanitized.group_count;
        delete sanitized.linked_users;
        delete sanitized.created_at;
        delete sanitized.updated_at;
      }
      if (!permissions?.canCheckUserAttendance) {
        delete sanitized.attendance_count;
      }

      return sanitized as WorkspaceUser & { is_guest?: boolean };
    })
  );

  return {
    data: withGuest as unknown as WorkspaceUser[],
    count: count as number,
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
