import { History } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import {
  type UserGroupActivityLogSearchParams,
  UserGroupActivityLogTable,
} from '../../activity-log-table';
import {
  AuditLogCardSkeleton,
  ListCardSkeleton,
  MembersCardSkeleton,
  ScheduleCardSkeleton,
} from './card-skeletons';
import { GroupSectionCard } from './group-section-card';
import {
  LinkedProductsCardServer,
  MembersCardServer,
  PostsCardServer,
  ScheduleCardServer,
  StorageCardServer,
} from './overview-cards';

export interface GroupOverviewSearchParams
  extends UserGroupActivityLogSearchParams {
  excludedGroups?: string | string[];
  month?: string;
  page?: string;
  pageSize?: string;
  q?: string;
}

interface GroupOverviewProps {
  canCreateUserGroupsPosts: boolean;
  canDeleteUserGroupsPosts: boolean;
  canUpdateUserGroups: boolean;
  canUpdateUserGroupsPosts: boolean;
  canViewAuditLogs: boolean;
  canViewPersonalInfo: boolean;
  canViewPublicInfo: boolean;
  canViewUserGroupsPosts: boolean;
  groupId: string;
  searchParams: Promise<GroupOverviewSearchParams>;
  wsId: string;
}

const MEMBERS_PAGE_SIZE = 10;

export function GroupOverview({
  canCreateUserGroupsPosts,
  canDeleteUserGroupsPosts,
  canUpdateUserGroups,
  canUpdateUserGroupsPosts,
  canViewAuditLogs,
  canViewPersonalInfo,
  canViewPublicInfo,
  canViewUserGroupsPosts,
  groupId,
  searchParams,
  wsId,
}: GroupOverviewProps) {
  return (
    <div
      className="grid w-full grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-5"
      data-testid="group-overview-grid"
    >
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
        <ScheduleSection
          wsId={wsId}
          groupId={groupId}
          canUpdateUserGroups={canUpdateUserGroups}
          searchParams={searchParams}
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
        <Suspense fallback={<AuditLogCardSkeleton />}>
          <AuditLogSection
            wsId={wsId}
            groupId={groupId}
            searchParams={searchParams}
          />
        </Suspense>
      )}
    </div>
  );
}

async function ScheduleSection({
  wsId,
  groupId,
  canUpdateUserGroups,
  searchParams,
}: {
  wsId: string;
  groupId: string;
  canUpdateUserGroups: boolean;
  searchParams: Promise<GroupOverviewSearchParams>;
}) {
  await connection();
  const { month } = await searchParams;

  return (
    <ScheduleCardServer
      wsId={wsId}
      groupId={groupId}
      canUpdateUserGroups={canUpdateUserGroups}
      month={month}
    />
  );
}

async function AuditLogSection({
  wsId,
  groupId,
  searchParams,
}: {
  wsId: string;
  groupId: string;
  searchParams: Promise<GroupOverviewSearchParams>;
}) {
  await connection();
  const [t, resolvedSearchParams] = await Promise.all([
    getTranslations(),
    searchParams,
  ]);

  return (
    <GroupSectionCard
      className="lg:col-span-2"
      accent="neutral"
      icon={<History className="h-5 w-5" />}
      title={t('ws-user-group-activity.title')}
      description={t('ws-user-group-activity.group_panel_description')}
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
        searchParams={resolvedSearchParams}
        compact
      />
    </GroupSectionCard>
  );
}
