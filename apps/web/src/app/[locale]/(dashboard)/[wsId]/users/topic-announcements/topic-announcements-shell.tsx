'use client';

import { MailCheck, Megaphone, TimerReset } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  TopicAnnouncementsProvider,
  useTopicAnnouncements,
} from './topic-announcements-context';

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
  const { overview } = useTopicAnnouncements();

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-semibold text-2xl tracking-tight">
                {t('title')}
              </h1>
              <p className="text-muted-foreground text-sm">
                {t('description')}
              </p>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:min-w-[32rem]">
          <Metric
            icon={<MailCheck className="h-4 w-4" />}
            label={t('metric_ready')}
            value={overview.readyContactCount}
          />
          <Metric
            icon={<TimerReset className="h-4 w-4" />}
            label={t('metric_queued')}
            value={overview.queuedAnnouncementCount}
          />
        </div>
      </div>

      {children}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{label}</p>
        <div className="text-dynamic-blue">{icon}</div>
      </div>
      <p className="mt-1 font-semibold text-2xl">{value}</p>
    </div>
  );
}
