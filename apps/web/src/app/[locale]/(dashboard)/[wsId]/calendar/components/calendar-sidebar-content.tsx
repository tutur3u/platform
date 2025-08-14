'use client';

import { NavLink } from '../../nav-link';
import { MiniCalendar } from './mini-calendar';
import type { NavLink as NavLinkType } from '@/components/navigation';
import {
  BarChart3,
  Calendar,
  CalendarDays,
  Clock,
  Settings,
} from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';

interface CalendarSidebarContentProps {
  wsId: string;
  isCollapsed?: boolean;
  onSubMenuClick?: (links: NavLinkType[], title: string) => void;
  onClick?: () => void;
}

export function CalendarSidebarContent({
  wsId,
  isCollapsed = false,
  onSubMenuClick,
  onClick,
}: CalendarSidebarContentProps) {
  const t = useTranslations();

  const calendarNavLinks: NavLinkType[] = [
    {
      title: t('calendar-tabs.calendar'),
      href: `/${wsId}/calendar`,
      icon: <Calendar className="h-5 w-5" />,
      matchExact: true,
    },
    {
      title: t('calendar-tabs.overview'),
      href: `/${wsId}/calendar/overview`,
      icon: <BarChart3 className="h-5 w-5" />,
      tempDisabled: true, // Coming soon
    },
    {
      title: t('calendar-tabs.events'),
      href: `/${wsId}/calendar/events`,
      icon: <CalendarDays className="h-5 w-5" />,
      tempDisabled: true, // Coming soon
    },
    {
      title: t('calendar-tabs.time-tracker'),
      href: `/${wsId}/calendar/time-tracker`,
      icon: <Clock className="h-5 w-5" />,
      tempDisabled: true, // Coming soon
    },
    // Sync History button hidden - requires special permissions
    // {
    //   title: t('calendar-tabs.sync-history'),
    //   href: `/${wsId}/calendar/history/sync`,
    //   icon: <Activity className="h-5 w-5" />,
    // },
    {
      title: t('calendar-tabs.settings'),
      href: `/${wsId}/calendar/settings`,
      icon: <Settings className="h-5 w-5" />,
      tempDisabled: true, // Coming soon
    },
  ];

  return (
    <div
      data-collapsed={isCollapsed}
      className="group flex flex-col gap-y-1 p-2"
    >
      {/* Mini Calendar */}
      {!isCollapsed && (
        <div className="mb-4">
          <MiniCalendar className="w-full" />
        </div>
      )}

      {/* Navigation Items */}
      <nav className="grid gap-y-1">
        {calendarNavLinks.map((link, index) => (
          <NavLink
            key={`calendar-nav-${link.href || link.title}-${index}`}
            wsId={wsId}
            link={link}
            isCollapsed={isCollapsed}
            onSubMenuClick={onSubMenuClick || (() => {})}
            onClick={onClick || (() => {})}
          />
        ))}
      </nav>
    </div>
  );
}
