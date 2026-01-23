import { createClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import UserGroupForm from './form';
import type { ManagerUser } from './hooks';
import { UserGroupsTable } from './user-groups-table';
import { getUserGroupMemberships } from './utils';

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
        const sp = await searchParams;

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

        const { data, count } = await getInitialData(
          wsId,
          sp,
          containsPermission('manage_users')
        );

        // Check permissions for the form and actions
        const canCreate = containsPermission('create_user_groups');
        const canUpdate = containsPermission('update_user_groups');
        const canDelete = containsPermission('delete_user_groups');

        const permissions = {
          canCreate,
          canUpdate,
          canDelete,
        };

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
            <UserGroupsTable
              wsId={wsId}
              initialData={{ data, count }}
              permissions={permissions}
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getInitialData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string } = {},
  hasManageUsers: boolean = false
) {
  try {
    const supabase = await createClient();

    const queryBuilder = supabase
      .from('workspace_user_groups_with_guest')
      .select(
        'id, ws_id, name, starting_date, ending_date, archived, notes, is_guest, amount, created_at',
        {
          count: 'exact',
        }
      )
      .eq('ws_id', wsId)
      .order('name');

    if (q) queryBuilder.ilike('name', `%${q}%`);

    if (!hasManageUsers) {
      const groupIds = await getUserGroupMemberships(wsId);
      if (groupIds.length === 0) {
        return { data: [], count: 0 } as { data: UserGroup[]; count: number };
      }
      queryBuilder.in('id', groupIds);
    }

    // Validate and clamp page and pageSize parameters
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);

    // Default to page 1 if invalid (NaN or <=0)
    const validPage =
      !Number.isNaN(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    // Default to 10 if invalid, enforce max of 100
    let validPageSize =
      !Number.isNaN(parsedSize) && parsedSize > 0 ? parsedSize : 10;
    validPageSize = Math.min(validPageSize, 100);

    const start = (validPage - 1) * validPageSize;
    const end = start + validPageSize - 1;
    queryBuilder.range(start, end);

    const { data: fetchedData, error, count } = await queryBuilder;
    if (error) throw error;

    let groups = fetchedData as UserGroup[];

    // Fetch managers for the fetched groups
    if (groups.length > 0) {
      const groupIds = groups.map((g) => g.id);
      const { data: managersData, error: managersError } = await supabase
        .from('workspace_user_groups_users')
        .select(
          'group_id, user:workspace_users!inner(id, full_name, avatar_url, display_name, email)'
        )
        .in('group_id', groupIds)
        .eq('role', 'TEACHER');

      if (!managersError && managersData) {
        const managersByGroup = managersData.reduce(
          (acc, item) => {
            if (!item.group_id) return acc;

            const groupId = item.group_id;
            if (!acc[groupId]) {
              acc[groupId] = [];
            }
            const groupManagers = acc[groupId];

            if (item.user) {
              groupManagers.push(item.user as ManagerUser);
            }
            return acc;
          },
          {} as Record<string, ManagerUser[]>
        );

        groups = groups.map((g) => ({
          ...g,
          managers: managersByGroup[g.id] ?? [],
        }));
      }
    }

    return { data: groups, count: count ?? 0 };
  } catch (error) {
    console.error('Error fetching initial user groups:', error);
    return { data: [], count: 0 };
  }
}
