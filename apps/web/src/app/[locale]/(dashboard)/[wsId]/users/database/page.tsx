import { getUserColumns } from './columns';
import ExportDialogContent from './export-dialog-content';
import Filters from './filters';
import UserForm from './form';
import ImportDialogContent from './import-dialog-content';
import { CustomDataTable } from '@/components/custom-data-table';
import { getPermissions } from '@/lib/workspace-helper';
import { createClient } from '@tutur3u/supabase/next/server';
import { WorkspaceUser } from '@tutur3u/types/primitives/WorkspaceUser';
import { WorkspaceUserField } from '@tutur3u/types/primitives/WorkspaceUserField';
import FeatureSummary from '@tutur3u/ui/components/ui/custom/feature-summary';
import { Separator } from '@tutur3u/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
}

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
  const { locale, wsId } = await params;

  const { data, count } = await getData(wsId, await searchParams);
  const { data: extraFields } = await getUserFields(wsId);

  const { containsPermission } = await getPermissions({
    wsId,
  });

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
        form={<UserForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={users}
        namespace="user-data-table"
        columnGenerator={getUserColumns}
        extraColumns={extraFields}
        extraData={{ locale, wsId }}
        count={count}
        filters={<Filters wsId={wsId} searchParams={await searchParams} />}
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
              searchParams={await searchParams}
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
          ...Object.fromEntries(extraFields.map((field) => [field.id, false])),
        }}
      />
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    includedGroups = [],
    excludedGroups = [],
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
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
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }

  return { data, count } as unknown as { data: WorkspaceUser[]; count: number };
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
