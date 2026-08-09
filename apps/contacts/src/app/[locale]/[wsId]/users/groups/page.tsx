import { ArrowLeft, ShieldAlert } from '@tuturuuu/icons';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getContactsWorkspacePermissions } from '@/lib/workspace';
import {
  type UserGroupActivityLogSearchParams,
  UserGroupActivityLogTable,
} from './activity-log-table';
import { loadInitialUserGroups, type UserGroupStatusFilter } from './bootstrap';
import UserGroupForm from './form';
import { UserGroupsTable } from './user-groups-table';

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
  tab?: string;
  includedTags?: string | string[];
  excludedTags?: string | string[];
}

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
  await connection();

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();
        const sp = await searchParams;
        const actor = await getSatelliteAppSessionUser('contacts');
        if (!actor?.id) notFound();

        const workspacePermissions = await getContactsWorkspacePermissions(
          wsId,
          actor
        );
        if (!workspacePermissions) notFound();
        const { withoutPermission, containsPermission } = workspacePermissions;

        if (withoutPermission('view_user_groups')) {
          return (
            <div className="flex min-h-[28rem] items-center justify-center px-4">
              <div className="w-full max-w-lg rounded-2xl border border-dynamic-red/25 bg-dynamic-red/5 p-8 text-center shadow-sm">
                <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-dynamic-red/10 text-dynamic-red">
                  <ShieldAlert className="size-6" aria-hidden="true" />
                </div>
                <h2 className="font-semibold text-xl">
                  {t('user-group-data-table.access_denied_title')}
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-muted-foreground text-sm leading-6">
                  {t('user-group-data-table.access_denied_description')}
                </p>
                <Button asChild className="mt-6" variant="outline">
                  <Link href={`/${wsId}/users`}>
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    {t('user-group-data-table.access_denied_action')}
                  </Link>
                </Button>
              </div>
            </div>
          );
        }

        // Check permissions for the form and actions
        const canCreate = containsPermission('create_user_groups');
        const canUpdate = containsPermission('update_user_groups');
        const canDelete = containsPermission('delete_user_groups');
        const canViewAuditLogs = containsPermission(
          'manage_workspace_audit_logs'
        );
        const selectedTab =
          sp.tab === 'audit-log' && canViewAuditLogs ? 'audit-log' : 'groups';
        const initialData =
          selectedTab === 'groups'
            ? await loadInitialUserGroups({
                actorId: actor.id,
                hasManageUsers: containsPermission('manage_users'),
                page: sp.page,
                pageSize: sp.pageSize,
                q: sp.q,
                status: parseUserGroupStatusFilter(
                  sp.status,
                  sp.includeArchived
                ),
                wsId,
              })
            : { data: [], count: 0 };

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
                canCreate && selectedTab === 'groups' ? (
                  <UserGroupForm
                    wsId={wsId}
                    canCreate={canCreate}
                    canUpdate={canUpdate}
                  />
                ) : undefined
              }
            />
            <Separator className="my-4" />
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Button
                asChild
                variant={selectedTab === 'groups' ? 'default' : 'outline'}
                size="sm"
              >
                <Link href={`/${wsId}/users/groups`}>
                  {t('ws-user-groups.plural')}
                </Link>
              </Button>
              {canViewAuditLogs && (
                <Button
                  asChild
                  variant={selectedTab === 'audit-log' ? 'default' : 'outline'}
                  size="sm"
                >
                  <Link href={`/${wsId}/users/groups?tab=audit-log`}>
                    {t('ws-user-group-activity.title')}
                  </Link>
                </Button>
              )}
            </div>
            {selectedTab === 'audit-log' && canViewAuditLogs ? (
              <UserGroupActivityLogTable
                wsId={wsId}
                searchParams={sp as UserGroupActivityLogSearchParams}
              />
            ) : (
              <UserGroupsTable
                wsId={wsId}
                initialData={initialData}
                isLimitedScope={!containsPermission('manage_users')}
                permissions={permissions}
              />
            )}
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}
