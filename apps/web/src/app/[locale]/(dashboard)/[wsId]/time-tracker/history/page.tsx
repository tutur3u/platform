import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getCurrentSupabaseUser,
  getCurrentUser,
} from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
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
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, workspace, isPersonal }) => {
        const user = await getCurrentSupabaseUser();
        const supabase = await createClient();

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
            getPermissions({ wsId }),
            getCurrentUser(),
          ]);
          if (!permissions) notFound();
          const { containsPermission } = permissions;

          currentUser = resolvedCurrentUser;
          canManageTimeTrackingRequests = containsPermission(
            'manage_time_tracking_requests'
          );
          canBypassTimeTrackingRequestApproval = containsPermission(
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
