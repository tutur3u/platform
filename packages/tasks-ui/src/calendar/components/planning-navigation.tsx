'use client';

import { CalendarDays, CheckSquare } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

/** Persistent planning views, including when the mobile sidebar is closed. */
export function PlanningNavigation({
  workspaceSlug,
  calendarRoot = false,
}: {
  workspaceSlug: string;
  calendarRoot?: boolean;
}) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations('sidebar_tabs');
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === locale) segments.shift();
  const calendarActive = calendarRoot
    ? segments.length === 1
    : segments[1] === 'calendar';
  const views = [
    {
      label: t('tasks'),
      href: `/${locale}/${workspaceSlug}/tasks`,
      icon: CheckSquare,
      active: !calendarActive,
    },
    {
      label: t('calendar'),
      href: `/${locale}/${workspaceSlug}${calendarRoot ? '' : '/calendar'}`,
      icon: CalendarDays,
      active: calendarActive,
    },
  ];
  return (
    <nav
      aria-label={`${t('tasks')} / ${t('calendar')}`}
      className="flex min-w-0 items-center gap-1 border-b bg-background px-2 py-1.5"
    >
      {views.map(({ label, href, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-9 items-center gap-2 rounded-md px-3 font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
            active
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
