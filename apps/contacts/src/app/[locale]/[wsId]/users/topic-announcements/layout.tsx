import { TOPIC_ANNOUNCEMENTS_SECRET } from '@tuturuuu/utils/topic-announcements';
import { getSecret, getSecrets } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import {
  isWorkspaceFeatureEnabled,
  resolveWorkspaceFeatureAccess,
} from '@/components/feature-gate/workspace-feature-access';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getContactsWorkspacePermissions } from '@/lib/workspace';
import {
  TopicAnnouncementsDisabledGate,
  TopicAnnouncementsForbiddenGate,
  TopicAnnouncementsUnavailableGate,
} from './topic-announcements-gate';
import { TopicAnnouncementsShell } from './topic-announcements-shell';

export const metadata: Metadata = {
  title: 'Topic Announcements',
  description: 'Manage verified contacts and reusable topic announcements.',
};

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string; wsId: string }>;
}

export default async function TopicAnnouncementsLayout({
  children,
  params,
}: LayoutProps) {
  await connection();

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, isPersonal }) => {
        const [permissions, secrets] = await Promise.all([
          getContactsWorkspacePermissions(wsId),
          getSecrets({ forceAdmin: true, wsId }),
        ]);

        const access = resolveWorkspaceFeatureAccess({
          canEnableFeature: Boolean(
            permissions?.containsPermission('manage_workspace_secrets')
          ),
          canManageFeature: Boolean(
            permissions?.containsPermission('send_user_group_post_emails')
          ),
          canView: Boolean(permissions?.containsPermission('manage_users')),
          // The module has always required an explicit opt-in secret, so shared
          // workspaces keep defaulting to off; only the 404 changes.
          enabled: isWorkspaceFeatureEnabled({
            defaultEnabled: false,
            isPersonal,
            value: getSecret(TOPIC_ANNOUNCEMENTS_SECRET, secrets ?? [])?.value,
          }),
          hasWorkspaceAccess: Boolean(permissions),
        });

        if (access.status === 'unavailable') {
          return <TopicAnnouncementsUnavailableGate />;
        }

        if (access.status === 'forbidden') {
          return <TopicAnnouncementsForbiddenGate />;
        }

        if (access.status === 'disabled') {
          return (
            <TopicAnnouncementsDisabledGate
              canEnable={access.canEnable}
              wsId={wsId}
            />
          );
        }

        return (
          <TopicAnnouncementsShell canSend={access.canManage} wsId={wsId}>
            {children}
          </TopicAnnouncementsShell>
        );
      }}
    </WorkspaceWrapper>
  );
}
