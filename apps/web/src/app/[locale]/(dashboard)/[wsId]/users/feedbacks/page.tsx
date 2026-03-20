import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { UserFeedbacksClient } from './user-feedbacks-client';

export const metadata: Metadata = {
  title: 'User Feedbacks',
  description: 'Review and manage workspace user feedbacks.',
};

interface PageProps {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function UserFeedbacksPage({ params }: PageProps) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, isPersonal }) => {
        if (isPersonal) {
          notFound();
        }

        const permissions = await getPermissions({ wsId });
        if (!permissions) {
          notFound();
        }

        const canViewFeedbacks =
          permissions.containsPermission('view_user_groups');
        const canManageFeedbacks = permissions.containsPermission(
          'update_user_groups_scores'
        );

        if (!canViewFeedbacks) {
          notFound();
        }

        return (
          <div className="container mx-auto px-4 py-6 md:px-8">
            <UserFeedbacksClient
              wsId={wsId}
              canManageFeedbacks={canManageFeedbacks}
            />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
