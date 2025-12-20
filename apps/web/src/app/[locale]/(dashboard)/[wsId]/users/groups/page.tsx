import { createClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getUserGroupColumns } from './columns';
import Filters from './filters';
import UserGroupForm from './form';

export const metadata: Metadata = {
  title: 'Groups',
  description: 'Manage Groups in the Users area of your Tuturuuu workspace.',
};

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  includedTags?: string | string[];
  excludedTags?: string | string[];
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspaceUserGroupsPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();
        // Check permissions
        const { withoutPermission, containsPermission } = await getPermissions({
          wsId,
        });
        if (withoutPermission('view_user_groups')) {
          return (
            <div className="flex h-96 items-center justify-center">
              <div className="text-center">
                <h2 className="font-semibold text-lg">Access Denied</h2>
                <p className="text-muted-foreground">
                  You don't have permission to view user groups.
                </p>
              </div>
            </div>
          );
        }

        const { data, count } = await getData(wsId, await searchParams);

        // Check permissions for the form and actions
        const canCreate = containsPermission('create_user_groups');
        const canUpdate = containsPermission('update_user_groups');
        const canDelete = containsPermission('delete_user_groups');

        const groups = data.map((g) => ({
          ...g,
          ws_id: wsId,
          href: `/${wsId}/users/groups/${g.id}`,
        }));
        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-user-groups.plural')}
              singularTitle={t('ws-user-groups.singular')}
              description={t('ws-user-groups.description')}
              createTitle={t('ws-user-groups.create')}
              createDescription={t('ws-user-groups.create_description')}
              form={
                canCreate ? (
                  <UserGroupForm
                    wsId={wsId}
                    canCreate={canCreate}
                    canUpdate={canUpdate}
                  />
                ) : undefined
              }
            />
            <Separator className="my-4" />
            <CustomDataTable
              data={groups}
              columnGenerator={getUserGroupColumns}
              namespace="user-group-data-table"
              count={count}
              filters={
                <Filters wsId={wsId} searchParams={await searchParams} />
              }
              extraData={{
                canCreateUserGroups: canCreate,
                canUpdateUserGroups: canUpdate,
                canDeleteUserGroups: canDelete,
              }}
              defaultVisibility={{
                id: false,
                locked: false,
                created_at: false,
              }}
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: { q?: string; page?: string; pageSize?: string; retry?: boolean } = {}
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_user_groups_with_guest')
    .select(
      'id, ws_id, name, starting_date, ending_date, archived, notes, is_guest,amount, created_at',
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId)
    .order('name');

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }

  return { data, count } as { data: UserGroup[]; count: number };
}
