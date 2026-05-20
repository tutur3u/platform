'use client';

import {
  BookOpenCheck,
  Download,
  MailCheck,
  Megaphone,
  Send,
  ShieldCheck,
  TimerReset,
  Upload,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  const { overview, wsId } = useTopicAnnouncements();

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl space-y-2">
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
          <div className="rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-2 text-dynamic-blue text-sm">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{t('verification_safety_note')}</p>
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

      <TopicAnnouncementsSectionNav
        baseHref={`/${wsId}/users/topic-announcements`}
      />

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

function TopicAnnouncementsSectionNav({ baseHref }: { baseHref: string }) {
  const pathname = usePathname();
  const t = useTranslations('ws-topic-announcements');
  const { overview } = useTopicAnnouncements();
  const groups = [
    {
      label: t('nav_group_send'),
      items: [
        {
          count: overview.announcementCount,
          description: t('nav_announcements_description'),
          href: `${baseHref}/announcements`,
          icon: Megaphone,
          title: t('nav_announcements'),
        },
        {
          count: overview.deliveredCount,
          description: t('nav_delivery_description'),
          href: `${baseHref}/delivery`,
          icon: Send,
          title: t('nav_delivery'),
        },
      ],
    },
    {
      label: t('nav_group_setup'),
      items: [
        {
          count: overview.contactCount,
          description: t('nav_contacts_description'),
          href: `${baseHref}/contacts`,
          icon: MailCheck,
          title: t('nav_contacts'),
        },
        {
          count: overview.templateCount,
          description: t('nav_templates_description'),
          href: `${baseHref}/templates`,
          icon: BookOpenCheck,
          title: t('nav_templates'),
        },
        {
          count: null,
          description: t('nav_import_description'),
          href: `${baseHref}/import`,
          icon: Upload,
          title: t('nav_import'),
        },
      ],
    },
  ];

  return (
    <div className="grid gap-3 xl:grid-cols-[1fr_1.5fr]">
      {groups.map((group) => (
        <div className="space-y-2" key={group.label}>
          <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            {group.label}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-none 2xl:grid-cols-2">
            {group.items.map((item) => (
              <RouteCard item={item} key={item.href} pathname={pathname} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RouteCard({
  item,
  pathname,
}: {
  item: {
    count: number | null;
    description: string;
    href: string;
    icon: typeof Megaphone;
    title: string;
  };
  pathname: string;
}) {
  const Icon = item.icon;
  const isActive =
    pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      className={cn(
        'rounded-md border p-3 transition-colors',
        isActive
          ? 'border-dynamic-blue/35 bg-dynamic-blue/10'
          : 'border-border/70 bg-background hover:border-dynamic-blue/25 hover:bg-foreground/5'
      )}
      href={item.href}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
            isActive
              ? 'border-dynamic-blue/25 bg-dynamic-blue/10 text-dynamic-blue'
              : 'border-border/70 text-muted-foreground'
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-sm">{item.title}</p>
            {item.count !== null ? (
              <span className="rounded-md border px-1.5 py-0.5 text-muted-foreground text-xs">
                {item.count}
              </span>
            ) : (
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-muted-foreground text-xs leading-5">
            {item.description}
          </p>
        </div>
      </div>
    </Link>
  );
}
