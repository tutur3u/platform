import { InvoiceUserHistoryAccordion } from '@tuturuuu/ui/finance/invoices/components/invoice-user-history-accordion';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import UserMonthAttendance from '../../attendance/user-month-attendance';
import { UserFeedbackPanel } from '../user-feedback-panel';
import {
  getAvailableUsersForReferral,
  getCouponData,
  getGroupData,
  getReferredUsers,
  getReportData,
  getUserDetailData,
  getUserSentEmails,
  getWorkspaceSettings,
  isUserGuest,
} from './data';
import EditUserDialog from './edit-user-dialog';
import { partitionUserGroupsBySchedule } from './group-schedule';
import LinkedPromotionsClient from './linked-promotions-client';
import { ProfileHeader } from './profile-header';
import { ProfileInfoPanel } from './profile-info-panel';
import ReferralSectionClient from './referral-section-client';
import { ReportsPanel } from './reports-panel';
import SentEmailsClient from './sent-emails-client';
import type { UserDetailMetric, UserDetailTab } from './types';
import { EMAIL_PAGE_SIZE } from './types';
import { UserDetailTabs } from './user-detail-tabs';
import { UserGroupsSection } from './user-groups-section';

export const metadata: Metadata = {
  title: 'User Details',
  description:
    'Manage user details in the Database area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
    userId: string;
  }>;
}

export default async function WorkspaceUserDetailsPage({ params }: Props) {
  const t = await getTranslations('user-data-table');
  const { wsId: id, userId } = await params;
  const workspace = await getWorkspace(id);
  if (!workspace) notFound();
  const wsId = workspace.id;

  const permissions = await getPermissions({ wsId });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  const hasPrivateInfo = containsPermission('view_users_private_info');
  const hasPublicInfo = containsPermission('view_users_public_info');
  const canCheckUserAttendance = containsPermission('check_user_attendance');
  const canUpdateUsers = containsPermission('update_users');
  const canViewFeedbacks = containsPermission('view_user_groups');
  const canManageFeedbacks = containsPermission('update_user_groups_scores');

  if (!hasPrivateInfo && !hasPublicInfo) {
    notFound();
  }

  const [data, isGuest] = await Promise.all([
    getUserDetailData({
      wsId,
      userId,
      hasPrivateInfo,
      hasPublicInfo,
    }),
    isUserGuest(userId),
  ]);

  const [
    groupResult,
    reportResult,
    couponResult,
    sentEmailResult,
    workspaceSettings,
    availableUsersResult,
    referredUsers,
  ] = await Promise.all([
    hasPrivateInfo
      ? getGroupData({ wsId, userId })
      : Promise.resolve({ data: [], count: 0 }),
    hasPrivateInfo
      ? getReportData({ wsId, userId })
      : Promise.resolve({ data: [], count: 0 }),
    hasPrivateInfo
      ? getCouponData({ wsId, userId })
      : Promise.resolve({ data: [], count: 0 }),
    hasPrivateInfo
      ? getUserSentEmails({ wsId, userId, pageSize: EMAIL_PAGE_SIZE })
      : Promise.resolve({ data: [], count: 0 }),
    hasPrivateInfo ? getWorkspaceSettings(wsId) : Promise.resolve(null),
    hasPrivateInfo && canUpdateUsers
      ? getAvailableUsersForReferral({
          wsId,
          currentUserId: userId,
        })
      : Promise.resolve({ data: [], count: 0 }),
    hasPrivateInfo ? getReferredUsers({ wsId, userId }) : Promise.resolve([]),
  ]);

  const groups = groupResult.data;
  const reports = reportResult.data;
  const coupons = couponResult.data;
  const sentEmails = sentEmailResult.data;
  const groupCount = groupResult.count;
  const reportCount = reportResult.count;
  const couponCount = couponResult.count;
  const sentEmailCount = sentEmailResult.count;
  const { scheduledGroups, unscheduledGroups, scheduledSessionCount } =
    partitionUserGroupsBySchedule(groups);
  const metrics = buildMetrics({
    couponCount,
    groupCount,
    hasPrivateInfo,
    referredUsersCount: referredUsers.length,
    reportCount,
    scheduledGroupsCount: scheduledGroups.length,
    scheduledSessionCount,
    sentEmailCount,
    t,
  });

  const tabs: UserDetailTab[] = [
    {
      value: 'overview',
      label: t('overview'),
      content: (
        <ProfileInfoPanel
          user={data}
          hasPrivateInfo={hasPrivateInfo}
          hasPublicInfo={hasPublicInfo}
          labels={{
            address: t('address'),
            basicInformation: t('basic_information'),
            birthday: t('birthday'),
            createdAt: t('created_at'),
            displayName: t('display_name'),
            email: t('email'),
            empty: t('common.empty'),
            ethnicity: t('ethnicity'),
            fullName: t('full_name'),
            gender: t('gender'),
            guardian: t('guardian'),
            nationalId: t('national_id'),
            note: t('note'),
            phone: t('phone'),
            updatedAt: t('updated_at'),
          }}
        />
      ),
    },
  ];

  if (hasPrivateInfo) {
    tabs.push({
      value: 'groups',
      label: t('groups_tab'),
      count: groupCount,
      content: (
        <UserGroupsSection
          wsId={wsId}
          scheduledGroups={scheduledGroups}
          unscheduledGroups={unscheduledGroups}
          labels={{
            groups: t('joined_groups'),
            hideUnscheduled: t('hide_unscheduled_groups'),
            manager: t('manager'),
            noSchedule: t('no_schedule'),
            noScheduledGroups: t('no_scheduled_groups'),
            sessions: t('sessions'),
            showUnscheduled: t('show_unscheduled_groups'),
            scheduledGroups: t('scheduled_groups'),
            unknown: t('common.unknown'),
            unscheduledGroups: t('unscheduled_groups'),
          }}
        />
      ),
    });
  }

  if (hasPrivateInfo || canCheckUserAttendance || canViewFeedbacks) {
    tabs.push({
      value: 'activity',
      label: t('activity_tab'),
      count: hasPrivateInfo ? reportCount + sentEmailCount : undefined,
      content: (
        <div className="grid gap-4 xl:grid-cols-2">
          {canCheckUserAttendance && (
            <UserMonthAttendance
              wsId={wsId}
              user={{
                ...data,
                id: data.id,
                full_name: data.display_name || data.full_name || null,
                href: `/${wsId}/users/database/${data.id}`,
                archived: data.archived ?? undefined,
                archived_until: data.archived_until ?? null,
                isGuest,
              }}
            />
          )}

          {canViewFeedbacks ? (
            <UserFeedbackPanel
              wsId={wsId}
              user={{
                id: data.id,
                full_name: data.full_name,
                display_name: data.display_name,
                has_require_attention_feedback:
                  !!data.has_require_attention_feedback,
              }}
              canManageFeedbacks={canManageFeedbacks}
            />
          ) : null}

          {hasPrivateInfo && (
            <ReportsPanel
              wsId={wsId}
              reports={reports}
              reportCount={reportCount}
              labels={{
                empty: t('no_reports'),
                reports: t('reports'),
              }}
            />
          )}

          {hasPrivateInfo && (
            <div className="xl:col-span-2">
              <SentEmailsClient
                wsId={wsId}
                userId={userId}
                initialEmails={sentEmails}
                initialCount={sentEmailCount}
                pageSize={EMAIL_PAGE_SIZE}
              />
            </div>
          )}
        </div>
      ),
    });
  }

  if (hasPrivateInfo) {
    tabs.push({
      value: 'billing-growth',
      label: t('billing_growth_tab'),
      count: couponCount + referredUsers.length,
      content: (
        <div className="grid gap-4 xl:grid-cols-2">
          <LinkedPromotionsClient
            wsId={wsId}
            userId={userId}
            canUpdateUsers={canUpdateUsers}
            initialPromotions={coupons}
            initialCount={couponCount}
          />

          <ReferralSectionClient
            wsId={wsId}
            userId={userId}
            canUpdateUsers={canUpdateUsers}
            workspaceSettings={workspaceSettings}
            initialAvailableUsers={availableUsersResult.data}
            initialAvailableUsersCount={availableUsersResult.count}
            initialReferredUsers={referredUsers}
          />

          <div className="xl:col-span-2">
            <InvoiceUserHistoryAccordion wsId={wsId} userId={userId} />
          </div>
        </div>
      ),
    });
  }

  return (
    <div className="flex min-h-full w-full flex-col gap-4">
      <ProfileHeader
        wsId={wsId}
        user={data}
        isGuest={isGuest}
        metrics={metrics}
        actions={
          canUpdateUsers ? <EditUserDialog wsId={wsId} data={data} /> : null
        }
        labels={{
          email: t('email'),
          guest: t('guest'),
          phone: t('phone'),
          referredBy: t('referred_by'),
          unknownUser: t('common.unknown'),
        }}
      />

      <UserDetailTabs tabs={tabs} />
    </div>
  );
}

function buildMetrics({
  couponCount,
  groupCount,
  hasPrivateInfo,
  referredUsersCount,
  reportCount,
  scheduledGroupsCount,
  scheduledSessionCount,
  sentEmailCount,
  t,
}: {
  couponCount: number;
  groupCount: number;
  hasPrivateInfo: boolean;
  referredUsersCount: number;
  reportCount: number;
  scheduledGroupsCount: number;
  scheduledSessionCount: number;
  sentEmailCount: number;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const metrics: UserDetailMetric[] = [];

  if (!hasPrivateInfo) return metrics;

  metrics.push(
    {
      label: t('metric_groups'),
      value: groupCount,
      description: t('metric_scheduled_groups', {
        count: scheduledGroupsCount,
      }),
    },
    {
      label: t('metric_sessions'),
      value: scheduledSessionCount,
      description: t('metric_sessions_description'),
    },
    {
      label: t('metric_activity'),
      value: reportCount + sentEmailCount,
      description: t('metric_activity_description', {
        reports: reportCount,
        emails: sentEmailCount,
      }),
    },
    {
      label: t('metric_growth'),
      value: couponCount + referredUsersCount,
      description: t('metric_growth_description', {
        coupons: couponCount,
        referrals: referredUsersCount,
      }),
    }
  );

  return metrics;
}
