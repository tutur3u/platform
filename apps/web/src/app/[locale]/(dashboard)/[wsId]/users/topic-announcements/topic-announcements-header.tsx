'use client';

import { MailCheck, Megaphone, ShieldCheck, TimerReset } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';

interface Props {
  announcementCount: number;
  contactCount: number;
  pendingContactCount: number;
  queuedAnnouncementCount: number;
  readyContactCount: number;
}

function Metric({
  description,
  icon,
  label,
  tone,
  value,
}: {
  description: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  tone: 'blue' | 'green' | 'orange' | 'purple';
  value: number;
}) {
  const Icon = icon;
  const toneClasses = {
    blue: 'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue',
    green: 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green',
    orange: 'border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange',
    purple: 'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple',
  }[tone];

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="font-semibold text-2xl">{value}</p>
        </div>
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-md border',
            toneClasses
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-muted-foreground text-xs">{description}</p>
    </div>
  );
}

export function TopicAnnouncementsHeader({
  announcementCount,
  contactCount,
  pendingContactCount,
  queuedAnnouncementCount,
  readyContactCount,
}: Props) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-semibold text-2xl">{t('title')}</h1>
            <p className="text-muted-foreground text-sm">{t('description')}</p>
          </div>
        </div>
        <div className="rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-2 text-dynamic-blue text-sm">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t('verification_safety_note')}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          description={t('metric_contacts_description')}
          icon={MailCheck}
          label={t('metric_contacts')}
          tone="blue"
          value={contactCount}
        />
        <Metric
          description={t('metric_ready_description')}
          icon={ShieldCheck}
          label={t('metric_ready')}
          tone="green"
          value={readyContactCount}
        />
        <Metric
          description={t('metric_pending_description')}
          icon={TimerReset}
          label={t('metric_pending')}
          tone="orange"
          value={pendingContactCount}
        />
        <Metric
          description={t('metric_queued_description')}
          icon={TimerReset}
          label={t('metric_queued')}
          tone="purple"
          value={queuedAnnouncementCount}
        />
        <Metric
          description={t('metric_announcements_description')}
          icon={Megaphone}
          label={t('metric_announcements')}
          tone="blue"
          value={announcementCount}
        />
      </div>
    </div>
  );
}
