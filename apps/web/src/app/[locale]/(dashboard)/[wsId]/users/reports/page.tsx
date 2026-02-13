import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getCurrentWorkspaceUser } from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import GroupReportsSelector from './group-reports-selector';

export const metadata: Metadata = {
  title: 'Reports',
  description: 'Manage Reports in the Users area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function WorkspaceUserReportsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();
        const user = await getCurrentWorkspaceUser(wsId);

        if (!user) {
          console.error('Failed to fetch current workspace user');
          notFound();
        }

        const permissions = await getPermissions({
          wsId,
        });
if (!permissions) notFound();
const { containsPermission } = permissions;

        const canViewUserGroupsReports = containsPermission(
          'view_user_groups_reports'
        );
        if (!canViewUserGroupsReports) {
          notFound();
        }

        const hasManageUsers = containsPermission('manage_users');
        const canCheckUserAttendance = containsPermission(
          'check_user_attendance'
        );
        const canApproveReports = containsPermission('approve_reports');
        const canCreateReports = containsPermission(
          'create_user_groups_reports'
        );
        const canUpdateReports = containsPermission(
          'update_user_groups_reports'
        );
        const canDeleteReports = containsPermission(
          'delete_user_groups_reports'
        );

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-user-reports.plural')}
              singularTitle={t('ws-user-reports.singular')}
              description={t('ws-user-reports.description')}
            />
            <Separator className="my-4" />
            <GroupReportsSelector
              wsId={wsId}
              workspaceUserId={user.virtual_user_id}
              hasManageUsers={hasManageUsers}
              canCheckUserAttendance={canCheckUserAttendance}
              canApproveReports={canApproveReports}
              canCreateReports={canCreateReports}
              canUpdateReports={canUpdateReports}
              canDeleteReports={canDeleteReports}
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}
