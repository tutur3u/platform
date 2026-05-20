import {
  getPermissions,
  getSecret,
  getSecrets,
} from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { TOPIC_ANNOUNCEMENTS_SECRET } from '@/lib/topic-announcements';
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
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, isPersonal }) => {
        if (isPersonal) notFound();

        const [permissions, secrets] = await Promise.all([
          getPermissions({ wsId }),
          getSecrets({ forceAdmin: true, wsId }),
        ]);
        const enabled =
          getSecret(TOPIC_ANNOUNCEMENTS_SECRET, secrets ?? [])?.value ===
          'true';

        if (
          !enabled ||
          !permissions ||
          permissions.withoutPermission('manage_users')
        ) {
          notFound();
        }

        return (
          <TopicAnnouncementsShell
            canSend={
              !permissions.withoutPermission('send_user_group_post_emails')
            }
            wsId={wsId}
          >
            {children}
          </TopicAnnouncementsShell>
        );
      }}
    </WorkspaceWrapper>
  );
}
