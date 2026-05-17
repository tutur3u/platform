import {
  getPermissions,
  getSecret,
  getSecrets,
} from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { TOPIC_ANNOUNCEMENTS_SECRET } from '@/lib/topic-announcements';
import { TopicAnnouncementsClient } from './topic-announcements-client';

export const metadata: Metadata = {
  title: 'Topic Announcements',
  description: 'Manage verified contacts and reusable topic announcements.',
};

interface PageProps {
  params: Promise<{ locale: string; wsId: string }>;
}

export default async function TopicAnnouncementsPage({ params }: PageProps) {
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
          <TopicAnnouncementsClient
            canSend={
              !permissions.withoutPermission('send_user_group_post_emails')
            }
            wsId={wsId}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
