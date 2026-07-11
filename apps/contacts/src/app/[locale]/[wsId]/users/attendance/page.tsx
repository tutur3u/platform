import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import WorkspaceWrapper from '@tuturuuu/ui/custom/workspace-wrapper';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getWorkspaceUserLinkForUser } from '@tuturuuu/utils/workspace-user-link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import AttendanceExportCard from './attendance-export-card';
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
  await connection();

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();

        // Satellites resolve the actor from Tuturuuu app-session auth, then look
        // up the workspace-user link with that id (never via Supabase-backed
        // user helpers — see the internal-app-auth guard).
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

        const canCheckUserAttendance = containsPermission(
          'check_user_attendance'
        );
        if (!canCheckUserAttendance) {
          notFound();
        }

        const hasManageUsers = containsPermission('manage_users');
        const canUpdateAttendance = containsPermission(
          'update_user_attendance'
        );

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-user-attendance.plural')}
              singularTitle={t('ws-user-attendance.singular')}
              description={t('ws-user-attendance.description')}
            />
            <Separator className="my-4" />
            <Tabs defaultValue="groups" className="space-y-6">
              <TabsList>
                <TabsTrigger value="groups">
                  {t('ws-user-attendance.selector_title')}
                </TabsTrigger>
                <TabsTrigger value="export">
                  {t('ws-user-attendance.export.title')}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="groups" className="mt-0">
                <GroupAttendanceSelector
                  wsId={wsId}
                  workspaceUserId={user?.virtual_user_id}
                  hasManageUsers={hasManageUsers}
                  canUpdateAttendance={canUpdateAttendance}
                />
              </TabsContent>
              <TabsContent value="export" className="mt-0">
                <AttendanceExportCard wsId={wsId} />
              </TabsContent>
            </Tabs>
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}
