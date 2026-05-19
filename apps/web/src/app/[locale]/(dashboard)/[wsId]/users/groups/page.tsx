import { createClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import {
  countUserGroupsForTable,
  listUserGroupsForTable,
} from '@/lib/user-groups/table-repository';
import UserGroupForm from './form';
import { UserGroupsTable } from './user-groups-table';
import {
  applyAttendanceMemberCounts,
  fetchManagersForGroups,
  getShouldCountManagersInAttendance,
  getUserGroupMemberships,
} from './utils';

export const metadata: Metadata = {
  title: 'Groups',
  description: 'Manage Groups in the Users area of your Tuturuuu workspace.',
};

interface SearchParams {
  includeArchived?: string;
  q?: string;
  page?: string;
  pageSize?: string;
  status?: string;
  includedTags?: string | string[];
  excludedTags?: string | string[];
}

type UserGroupStatusFilter = 'all' | 'active' | 'archived';

function parseUserGroupStatusFilter(
  status: string | undefined,
  includeArchived: string | undefined
): UserGroupStatusFilter {
  if (status === 'all' || status === 'archived') return status;
  if (includeArchived === 'true') return 'all';
  return 'active';
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
        const workspacePermissions = await getPermissions({
          wsId,
        });
        if (!workspacePermissions) notFound();
        const { withoutPermission, containsPermission } = workspacePermissions;

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

        const initialData = await getInitialData(
          wsId,
          {
            page: sp.page,
            pageSize: sp.pageSize,
            q: sp.q,
            status: parseUserGroupStatusFilter(sp.status, sp.includeArchived),
          },
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
              initialData={initialData}
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
    pageSize = '50',
    status = 'active',
  }: {
    q?: string;
    page?: string;
    pageSize?: string;
    status?: UserGroupStatusFilter;
  } = {},
  hasManageUsers: boolean = false
) {
  try {
    const supabase = await createClient();

    let accessibleGroupIds: string[] | null = null;

    if (!hasManageUsers) {
      const groupIds = await getUserGroupMemberships(wsId);
      if (groupIds.length === 0) {
        return { data: [], count: 0 };
      }
      accessibleGroupIds = groupIds;
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

    const [fetchedGroups, filteredCount] = await Promise.all([
      listUserGroupsForTable({
        accessibleGroupIds,
        page: validPage,
        pageSize: validPageSize,
        q,
        status,
        wsId,
      }),
      countUserGroupsForTable({
        accessibleGroupIds,
        q,
        status,
        wsId,
      }),
    ]);

    let groups = fetchedGroups as UserGroup[];

    // Fetch managers for the fetched groups
    if (groups.length > 0) {
      const groupIds = groups.map((g) => g.id);
      const [managersByGroup, countManagersInAttendance] = await Promise.all([
        fetchManagersForGroups(supabase, groupIds),
        getShouldCountManagersInAttendance(wsId),
      ]);

      groups = applyAttendanceMemberCounts(
        groups,
        managersByGroup,
        countManagersInAttendance
      );
    }

    return {
      data: groups,
      count: filteredCount,
    };
  } catch (error) {
    console.error('Error fetching initial user groups:', error);
    return {
      data: [],
      count: 0,
      error: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
