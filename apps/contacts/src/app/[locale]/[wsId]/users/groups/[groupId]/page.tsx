import { History } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getContactsWorkspacePermissions } from '@/lib/workspace';
import {
  type UserGroupActivityLogSearchParams,
  UserGroupActivityLogTable,
} from '../activity-log-table';
import {
  ListCardSkeleton,
  MembersCardSkeleton,
  ScheduleCardSkeleton,
} from './_components/card-skeletons';
import { GroupSectionCard } from './_components/group-section-card';
import {
  LinkedProductsCardServer,
  MembersCardServer,
  PostsCardServer,
  ScheduleCardServer,
  StorageCardServer,
} from './_components/overview-cards';

export const metadata: Metadata = {
  title: 'Group Details',
  description:
    'Manage Group Details in the Groups area of your Tuturuuu workspace.',
};

interface SearchParams extends UserGroupActivityLogSearchParams {
  q?: string;
  month?: string;
  page?: string;
  pageSize?: string;
  excludedGroups?: string | string[];
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    groupId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

const MEMBERS_PAGE_SIZE = 10;

export default async function UserGroupDetailsPage({
  params,
  searchParams,
}: Props) {
  await connection();

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, groupId }) => {
        const t = await getTranslations();
        const sp = await searchParams;
        const permissions = await getContactsWorkspacePermissions(wsId);
        if (!permissions) notFound();
        const { containsPermission } = permissions;

        const canViewUserGroups = containsPermission('view_user_groups');
        if (!canViewUserGroups) {
          notFound();
        }

        const canViewPersonalInfo = containsPermission(
          'view_users_private_info'
        );
        const canViewPublicInfo = containsPermission('view_users_public_info');
        const canUpdateUserGroups = containsPermission('update_user_groups');
        const canViewAuditLogs = containsPermission(
          'manage_workspace_audit_logs'
        );

        const canViewUserGroupsPosts = containsPermission(
          'view_user_groups_posts'
        );
        const canCreateUserGroupsPosts = containsPermission(
          'create_user_groups_posts'
        );
        const canUpdateUserGroupsPosts = containsPermission(
          'update_user_groups_posts'
        );
        const canDeleteUserGroupsPosts = containsPermission(
          'delete_user_groups_posts'
        );

        return (
          <>
            <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-2">
              <Suspense fallback={<MembersCardSkeleton />}>
                <MembersCardServer
                  wsId={wsId}
                  groupId={groupId}
                  pageSize={MEMBERS_PAGE_SIZE}
                  canViewPersonalInfo={canViewPersonalInfo}
                  canViewPublicInfo={canViewPublicInfo}
                  canUpdateUserGroups={canUpdateUserGroups}
                />
              </Suspense>

              <Suspense fallback={<ScheduleCardSkeleton />}>
                <ScheduleCardServer
                  wsId={wsId}
                  groupId={groupId}
                  canUpdateUserGroups={canUpdateUserGroups}
                  month={sp.month}
                />
              </Suspense>

              {canViewUserGroupsPosts && (
                <Suspense fallback={<ListCardSkeleton rows={3} />}>
                  <PostsCardServer
                    wsId={wsId}
                    groupId={groupId}
                    canUpdatePosts={canUpdateUserGroupsPosts}
                    canCreatePosts={canCreateUserGroupsPosts}
                    canDeletePosts={canDeleteUserGroupsPosts}
                    canViewPosts={canViewUserGroupsPosts}
                  />
                </Suspense>
              )}

              <Suspense fallback={<ListCardSkeleton rows={2} />}>
                <LinkedProductsCardServer
                  wsId={wsId}
                  groupId={groupId}
                  canUpdateLinkedProducts={canUpdateUserGroups}
                />
              </Suspense>

              <Suspense fallback={<ListCardSkeleton rows={3} />}>
                <StorageCardServer
                  wsId={wsId}
                  groupId={groupId}
                  canUpdateGroup={canUpdateUserGroups}
                />
              </Suspense>

              {canViewAuditLogs && (
                <GroupSectionCard
                  className="lg:col-span-2"
                  accent="neutral"
                  icon={<History className="h-5 w-5" />}
                  title={t('ws-user-group-activity.title')}
                  description={t(
                    'ws-user-group-activity.group_panel_description'
                  )}
                  action={
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/${wsId}/users/groups?tab=audit-log&logGroupId=${groupId}`}
                      >
                        {t('ws-user-group-activity.open_full_log')}
                      </Link>
                    </Button>
                  }
                >
                  <UserGroupActivityLogTable
                    wsId={wsId}
                    groupId={groupId}
                    searchParams={sp}
                    compact
                  />
                </GroupSectionCard>
              )}
            </div>
            <Separator className="my-5" />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}
