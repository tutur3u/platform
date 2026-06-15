'use client';

import {
  BookOpenCheck,
  type LucideIcon,
  Megaphone,
  Send,
  Upload,
  Users,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTopicAnnouncements } from './topic-announcements-context';

type TabSegment =
  | 'announcements'
  | 'delivery'
  | 'contacts'
  | 'templates'
  | 'import';

type TabLabelKey =
  | 'nav_announcements'
  | 'nav_delivery'
  | 'nav_contacts'
  | 'nav_templates'
  | 'nav_import';

type GroupLabelKey = 'nav_group_send' | 'nav_group_setup';

interface TabConfig {
  segment: TabSegment;
  labelKey: TabLabelKey;
  icon: LucideIcon;
  badge?: number;
}

function getActiveSegment(pathname: string): TabSegment {
  const marker = '/topic-announcements';
  const index = pathname.indexOf(marker);
  if (index === -1) return 'announcements';
  const rest = pathname.slice(index + marker.length).replace(/^\/+/, '');
  const segment = rest.split('/')[0];
  if (
    segment === 'delivery' ||
    segment === 'contacts' ||
    segment === 'templates' ||
    segment === 'import'
  ) {
    return segment;
  }
  return 'announcements';
}

export function TopicAnnouncementsTabNav() {
  const t = useTranslations('ws-topic-announcements');
  const pathname = usePathname();
  const params = useParams<{ wsId: string }>();
  const { overview } = useTopicAnnouncements();
  const wsId = params?.wsId;
  const active = getActiveSegment(pathname ?? '');

  const groups: { labelKey: GroupLabelKey; tabs: TabConfig[] }[] = [
    {
      labelKey: 'nav_group_send',
      tabs: [
        {
          segment: 'announcements',
          labelKey: 'nav_announcements',
          icon: Megaphone,
        },
        {
          segment: 'delivery',
          labelKey: 'nav_delivery',
          icon: Send,
          badge: overview.deliveredCount,
        },
      ],
    },
    {
      labelKey: 'nav_group_setup',
      tabs: [
        {
          segment: 'contacts',
          labelKey: 'nav_contacts',
          icon: Users,
          badge: overview.contactCount,
        },
        {
          segment: 'templates',
          labelKey: 'nav_templates',
          icon: BookOpenCheck,
          badge: overview.templateCount,
        },
        { segment: 'import', labelKey: 'nav_import', icon: Upload },
      ],
    },
  ];

  return (
    <nav
      aria-label={t('title')}
      className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {groups.map((group, groupIndex) => (
        <div className="flex items-center gap-1.5" key={group.labelKey}>
          {groupIndex > 0 ? (
            <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
          ) : null}
          <span className="hidden shrink-0 pr-0.5 font-medium text-muted-foreground text-xs uppercase tracking-wide lg:inline">
            {t(group.labelKey)}
          </span>
          {group.tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.segment === active;
            return (
              <Link
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 font-medium text-sm transition-colors',
                  isActive
                    ? 'border-dynamic-blue/40 bg-dynamic-blue/10 text-dynamic-blue'
                    : 'border-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                )}
                href={`/${wsId}/users/topic-announcements/${tab.segment}`}
                key={tab.segment}
              >
                <Icon className="h-4 w-4" />
                {t(tab.labelKey)}
                {tab.badge && tab.badge > 0 ? (
                  <Badge
                    className="h-5 min-w-5 justify-center px-1.5"
                    variant="secondary"
                  >
                    {tab.badge}
                  </Badge>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
