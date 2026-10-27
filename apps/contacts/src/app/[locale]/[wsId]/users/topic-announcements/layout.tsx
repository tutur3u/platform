import {
  isTopicTeacherAssignmentsEnabled,
  TOPIC_ANNOUNCEMENTS_SECRET,
} from '@tuturuuu/utils/topic-announcements';
import { getSecret, getSecrets } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { resolveWorkspaceFeatureAccess } from '@/components/feature-gate/workspace-feature-access';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getContactsWorkspacePermissions } from '@/lib/workspace';
import { TeacherTopicsView } from './teacher-topics-view';
import {
  TopicAnnouncementsDisabledGate,
  TopicAnnouncementsForbiddenGate,
  TopicAnnouncementsPersonalGate,
  TopicAnnouncementsUnavailableGate,
} from './topic-announcements-gate';
import { isTopicAnnouncementsModuleEnabled } from './topic-announcements-module';
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

        const isSupervisor = Boolean(
          permissions?.containsPermission('manage_users')
        );
        // Teacher-assigned topics stay off until the workspace opts in, so
        // live workspaces keep the supervisor-only module.
        const teacherAssignmentsEnabled = isTopicTeacherAssignmentsEnabled(
          secrets ?? []
        );
        // Assignment-scoped teachers see only their topics; the API enforces
        // the assignment on every read and write.
        const isTeacher =
          teacherAssignmentsEnabled &&
          !isSupervisor &&
          Boolean(
            permissions?.containsPermission('create_user_groups_posts') ||
              permissions?.containsPermission('update_user_groups_posts')
          );

        const access = resolveWorkspaceFeatureAccess({
          canEnableFeature: Boolean(
            permissions?.containsPermission('manage_workspace_secrets')
          ),
          canManageFeature: Boolean(
            permissions?.containsPermission('send_user_group_post_emails')
          ),
          canView: isSupervisor || isTeacher,
          // The same rule as the topic APIs: the secret must be exactly
          // 'true'. Anything the APIs refuse must not mount the module, whose
          // queries would only 404.
          enabled: isTopicAnnouncementsModuleEnabled(
            getSecret(TOPIC_ANNOUNCEMENTS_SECRET, secrets ?? [])?.value
          ),
          hasWorkspaceAccess: Boolean(permissions),
        });

        // Every topic API refuses personal workspaces.
        if (isPersonal) return <TopicAnnouncementsPersonalGate />;

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

        if (isTeacher) {
          return <TeacherTopicsView canSend={access.canManage} wsId={wsId} />;
        }

        return (
          <TopicAnnouncementsShell
            canSend={access.canManage}
            teacherAssignmentsEnabled={teacherAssignmentsEnabled}
            wsId={wsId}
          >
            {children}
          </TopicAnnouncementsShell>
        );
      }}
    </WorkspaceWrapper>
  );
}
