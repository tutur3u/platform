import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getCurrentWorkspaceUser } from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import GroupAttendanceSelector from './group-attendance-selector';

export const metadata: Metadata = {
  title: 'Attendance',
  description:
    'Manage Attendance in the Users area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function WorkspaceUserAttendancePage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();
        const user = await getCurrentWorkspaceUser(wsId);

        if (!user) {
          console.error('Failed to fetch current workspace user');
          notFound();
        }

        const { containsPermission } = await getPermissions({
          wsId,
        });

        const canCheckUserAttendance = containsPermission(
          'check_user_attendance'
        );
        if (!canCheckUserAttendance) {
          notFound();
        }

        const hasManageUsers = containsPermission('manage_users');
        const canUpdateAttendance = containsPermission('check_user_attendance');

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-user-attendance.plural')}
              singularTitle={t('ws-user-attendance.singular')}
              description={t('ws-user-attendance.description')}
            />
            <Separator className="my-4" />
            <GroupAttendanceSelector
              wsId={wsId}
              workspaceUserId={user?.virtual_user_id}
              hasManageUsers={hasManageUsers}
              canUpdateAttendance={canUpdateAttendance}
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}
