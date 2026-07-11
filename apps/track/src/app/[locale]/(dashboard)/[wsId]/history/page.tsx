import {
  getSatelliteAppSessionUser,
  getSatelliteCurrentUser,
} from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { SessionHistory } from '../components/session-history';

export const metadata: Metadata = {
  title: 'History',
  description:
    'Manage History in the Time Tracker area of your Tuturuuu workspace.',
};

export default async function TimeTrackerHistoryPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, workspace, isPersonal }) => {
        const user = await getSatelliteAppSessionUser('track');
        const supabase = await createAdminClient({ noCookie: true });

        if (!user) return notFound();

        const { data: categories } = await supabase
          .from('time_tracking_categories')
          .select('*')
          .eq('ws_id', wsId);

        // Fetch permissions and current user for non-personal workspaces
        let currentUser = null;
        let canManageTimeTrackingRequests = false;
        let canBypassTimeTrackingRequestApproval = false;

        if (!isPersonal) {
          const [permissions, resolvedCurrentUser] = await Promise.all([
            getPermissions({ user, wsId }),
            getSatelliteCurrentUser('track'),
          ]);
          if (!permissions) notFound();

          currentUser = resolvedCurrentUser;
          canManageTimeTrackingRequests = permissions.containsPermission(
            'manage_time_tracking_requests'
          );
          canBypassTimeTrackingRequestApproval = permissions.containsPermission(
            'bypass_time_tracking_request_approval'
          );
        }

        return (
          <SessionHistory
            wsId={wsId}
            userId={user.id}
            categories={categories}
            workspace={workspace}
            isPersonal={isPersonal}
            currentUser={currentUser}
            canManageTimeTrackingRequests={canManageTimeTrackingRequests}
            canBypassTimeTrackingRequestApproval={
              canBypassTimeTrackingRequestApproval
            }
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
