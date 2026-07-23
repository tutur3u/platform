import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { getWorkspaceUserLinkForUser } from '@tuturuuu/utils/workspace-user-link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getContactsWorkspacePermissions } from '@/lib/workspace';
import { postsSearchParamsCache } from '../posts/search-params.server';
import type { RawPostsSearchParams } from '../posts/types';
import ReportsHub from './reports-hub';

export const metadata: Metadata = {
  description:
    'Create, review, automate, and safely deliver workspace reports.',
  title: 'Reports',
};

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; wsId: string }>;
  searchParams: Promise<RawPostsSearchParams & { view?: string }>;
}) {
  await connection();
  const rawSearchParams = await searchParams;
  const parsedPostParams = await postsSearchParamsCache.parse(searchParams);

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const actor = await getSatelliteAppSessionUser('contacts');
        const user = actor?.id
          ? await getWorkspaceUserLinkForUser(wsId, actor.id)
          : null;
        const permissions = await getContactsWorkspacePermissions(wsId);
        if (!user || !permissions) notFound();

        const canViewDaily =
          permissions.containsPermission('view_user_groups_posts') ||
          permissions.containsPermission('approve_posts');
        const canViewPeriodic =
          permissions.containsPermission('view_user_groups_reports') ||
          permissions.containsPermission('approve_reports');
        if (!canViewDaily && !canViewPeriodic) notFound();

        const { locale } = await params;
        return (
          <ReportsHub
            canManageAutomation={permissions.containsPermission(
              'manage_user_report_automation'
            )}
            canViewDaily={canViewDaily}
            canViewPeriodic={canViewPeriodic}
            initialView={rawSearchParams.view}
            locale={locale}
            periodicPermissions={{
              canApproveReports:
                permissions.containsPermission('approve_reports'),
              canCheckUserAttendance: permissions.containsPermission(
                'check_user_attendance'
              ),
              canCreateReports: permissions.containsPermission(
                'create_user_groups_reports'
              ),
              canDeleteReports: permissions.containsPermission(
                'delete_user_groups_reports'
              ),
              canSendReports: permissions.containsPermission(
                'send_user_group_report_emails'
              ),
              canUpdateReports: permissions.containsPermission(
                'update_user_groups_reports'
              ),
            }}
            postSearchParams={parsedPostParams}
            wsId={wsId}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
