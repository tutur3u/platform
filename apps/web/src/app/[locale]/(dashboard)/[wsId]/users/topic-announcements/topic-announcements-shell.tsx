'use client';

import { Megaphone } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { TopicAnnouncementsProvider } from './topic-announcements-context';
import { TopicAnnouncementsGettingStarted } from './topic-announcements-getting-started';
import { TopicAnnouncementsStatsHeader } from './topic-announcements-stats-header';
import { TopicAnnouncementsTabNav } from './topic-announcements-tab-nav';

export { useTopicAnnouncements } from './topic-announcements-context';

export function TopicAnnouncementsShell({
  canSend,
  children,
  wsId,
}: {
  canSend: boolean;
  children: ReactNode;
  wsId: string;
}) {
  return (
    <TopicAnnouncementsProvider canSend={canSend} wsId={wsId}>
      <TopicAnnouncementsChrome>{children}</TopicAnnouncementsChrome>
    </TopicAnnouncementsProvider>
  );
}

function TopicAnnouncementsChrome({ children }: { children: ReactNode }) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue">
          <Megaphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">
            {t('title')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
      </div>

      <TopicAnnouncementsStatsHeader />

      <TopicAnnouncementsGettingStarted />

      <TopicAnnouncementsTabNav />

      {children}
    </div>
  );
}
