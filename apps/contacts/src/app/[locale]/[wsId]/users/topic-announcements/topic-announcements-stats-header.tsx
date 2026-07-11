'use client';

import { MailCheck, Send, TimerReset, Users } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useTopicAnnouncements } from './topic-announcements-context';
import { TopicAnnouncementsHelpTip } from './topic-announcements-help-tip';

const ACCENTS = {
  blue: {
    chip: 'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue',
  },
  green: {
    chip: 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green',
  },
  orange: {
    chip: 'border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange',
  },
  purple: {
    chip: 'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple',
  },
} as const;

type Accent = keyof typeof ACCENTS;

function StatCard({
  accent,
  help,
  icon,
  label,
  value,
}: {
  accent: Accent;
  help: string;
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <p className="text-muted-foreground text-sm">{label}</p>
          <TopicAnnouncementsHelpTip label={help} />
        </div>
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg border [&>svg]:h-4 [&>svg]:w-4',
            ACCENTS[accent].chip
          )}
        >
          {icon}
        </div>
      </div>
      <p className="mt-2 font-semibold text-2xl tracking-tight">{value}</p>
    </div>
  );
}

export function TopicAnnouncementsStatsHeader() {
  const t = useTranslations('ws-topic-announcements');
  const { overview } = useTopicAnnouncements();

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        accent="green"
        help={t('metric_ready_description')}
        icon={<MailCheck />}
        label={t('metric_ready')}
        value={overview.readyContactCount}
      />
      <StatCard
        accent="orange"
        help={t('metric_pending_description')}
        icon={<Users />}
        label={t('metric_pending')}
        value={overview.pendingContactCount}
      />
      <StatCard
        accent="blue"
        help={t('metric_queued_description')}
        icon={<TimerReset />}
        label={t('metric_queued')}
        value={overview.queuedAnnouncementCount}
      />
      <StatCard
        accent="purple"
        help={t('metric_delivered_description')}
        icon={<Send />}
        label={t('metric_delivered')}
        value={overview.deliveredCount}
      />
    </div>
  );
}
