import WorkspaceWrapper from '@/components/workspace-wrapper';
import type { Metadata } from 'next';
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
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
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
}

interface PageProps {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function TimeTrackerRequestsPage({
  params,
}: PageProps) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {


        return (
          <div className="container mx-auto px-4 py-6 md:px-8">
            <RequestsClient
              wsId={wsId}
            />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
