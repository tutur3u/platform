import { AlertTriangle } from '@tuturuuu/icons';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { RequestsClient } from './requests-client';

export const metadata: Metadata = {
  title: 'Time Tracking Requests',
  description: 'Manage time tracking requests in your workspace.',
};

export interface ExtendedTimeTrackingRequest {
  id: string;
  workspace_id: string;
  user_id: string;
  task_id: string | null;
  category_id: string | null;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  images: string[] | null;
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_INFO';
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  needs_info_requested_by: string | null;
  needs_info_requested_at: string | null;
  needs_info_reason: string | null;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    display_name: string;
    avatar_url: string;
    user_private_details: {
      email: string;
    };
  } | null;
  category: {
    id: string;
    name: string;
    color: string;
  } | null;
  task: {
    id: string;
    name: string;
  } | null;
  approved_by_user?: {
    id: string;
    display_name: string;
  } | null;
  rejected_by_user?: {
    id: string;
    display_name: string;
  } | null;
  needs_info_requested_by_user?: {
    id: string;
    display_name: string;
  } | null;
}

interface PageProps {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function TimeTrackerRequestsPage({ params }: PageProps) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, isPersonal }) => {
        // Personal workspaces don't have time tracking request flows
        if (isPersonal) {
          return (
            <div className="container mx-auto px-4 py-6 md:px-8">
              <div className="rounded-md bg-blue-50 p-4 dark:bg-blue-900/20">
                <div className="flex">
                  <div className="shrink-0">
                    <AlertTriangle
                      className="h-5 w-5 text-blue-400"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="ml-3">
                    <h3 className="font-medium text-blue-800 text-sm dark:text-blue-200">
                      Time tracking requests are not available for personal
                      workspaces.
                    </h3>
                    <p className="mt-1 text-blue-700 text-sm dark:text-blue-300">
                      Personal workspaces have no time tracking restrictions.
                      You can add and edit time entries freely without needing
                      approval.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        const permissions = await getPermissions({ wsId });
        if (!permissions) notFound();
        const { containsPermission } = permissions;

        const currentUser = await getCurrentUser();

        const canManageTimeTrackingRequests = containsPermission(
          'manage_time_tracking_requests'
        );

        const canBypassTimeTrackingRequestApproval = containsPermission(
          'bypass_time_tracking_request_approval'
        );

        return (
          <div className="container mx-auto px-4 py-6 md:px-8">
            <RequestsClient
              wsId={wsId}
              currentUser={currentUser}
              canManageTimeTrackingRequests={canManageTimeTrackingRequests}
              canBypassTimeTrackingRequestApproval={
                canBypassTimeTrackingRequestApproval
              }
            />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
