import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import WorkspaceWrapper from '@tuturuuu/ui/custom/workspace-wrapper';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getWorkspaceUserLinkForUser } from '@tuturuuu/utils/workspace-user-link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
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
  await connection();

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();
        // Satellites resolve the actor from Tuturuuu app-session auth, never via
        // Supabase-backed user helpers (see the internal-app-auth guard).
        const actor = await getSatelliteAppSessionUser('contacts');
        const user = actor?.id
          ? await getWorkspaceUserLinkForUser(wsId, actor.id)
          : null;

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
