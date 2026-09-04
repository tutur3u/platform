import { ENABLE_FEEDBACKS_CONFIG_ID } from '@tuturuuu/internal-api/workspace-configs';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import {
  isWorkspaceFeatureEnabled,
  resolveWorkspaceFeatureAccess,
} from '@/components/feature-gate/workspace-feature-access';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import {
  getContactsWorkspaceConfigValue,
  getContactsWorkspacePermissions,
} from '@/lib/workspace';
import {
  FeedbacksDisabledGate,
  FeedbacksForbiddenGate,
  FeedbacksUnavailableGate,
} from './feedbacks-gate';
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
  await connection();

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, isPersonal }) => {
        const permissions = await getContactsWorkspacePermissions(wsId);
        const configValue = permissions
          ? await getContactsWorkspaceConfigValue(
              wsId,
              ENABLE_FEEDBACKS_CONFIG_ID
            )
          : null;

        const access = resolveWorkspaceFeatureAccess({
          canEnableFeature: Boolean(
            permissions?.containsPermission('manage_workspace_settings')
          ),
          canManageFeature: Boolean(
            permissions?.containsPermission('update_user_groups_scores')
          ),
          canView: Boolean(permissions?.containsPermission('view_user_groups')),
          enabled: isWorkspaceFeatureEnabled({
            defaultEnabled: true,
            isPersonal,
            value: configValue,
          }),
          hasWorkspaceAccess: Boolean(permissions),
        });

        if (access.status === 'unavailable') {
          return <FeedbacksUnavailableGate />;
        }

        if (access.status === 'forbidden') {
          return <FeedbacksForbiddenGate />;
        }

        if (access.status === 'disabled') {
          return (
            <FeedbacksDisabledGate canEnable={access.canEnable} wsId={wsId} />
          );
        }

        return (
          <div className="container mx-auto px-4 py-6 md:px-8">
            <UserFeedbacksClient
              canManageFeedbacks={access.canManage}
              wsId={wsId}
            />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
