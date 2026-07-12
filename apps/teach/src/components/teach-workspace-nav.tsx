'use client';

import {
  BarChart3,
  BookOpenCheck,
  CalendarCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  Library,
  Settings,
  Sparkles,
} from '@tuturuuu/icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

const navItems = [
  { href: '', icon: GraduationCap, key: 'dashboard' },
  { href: 'courses', icon: BookOpenCheck, key: 'courses' },
  { href: 'attendance', icon: CalendarCheck, key: 'attendance' },
  { href: 'assignments', icon: ClipboardList, key: 'assignments' },
  { href: 'reports', icon: FileText, key: 'reports' },
  { href: 'metrics', icon: BarChart3, key: 'metrics' },
  { href: 'education', icon: Library, key: 'education' },
  { href: 'settings', icon: Settings, key: 'settings' },
] as const;

export function TeachWorkspaceNav({ wsId }: { wsId: string }) {
  const pathname = usePathname();
  const t = useTranslations('teachShell');

  return (
    <aside className="fixed inset-x-0 bottom-0 z-40 border-border border-t-2 bg-background pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_0_var(--border)] md:inset-y-4 md:right-auto md:left-4 md:w-24 md:border-2 md:pb-0 md:shadow-[7px_7px_0_var(--border)]">
      <div className="hidden h-24 items-center justify-center md:flex">
        <Link
          aria-label="Teach"
          className="relative flex h-14 w-14 items-center justify-center border-2 border-border bg-dynamic-cyan/15 text-foreground shadow-[4px_4px_0_var(--border)] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none"
          href={`/${wsId}`}
        >
          <GraduationCap className="h-7 w-7" />
          <span className="absolute -right-2 -bottom-2 flex h-6 w-6 items-center justify-center border-2 border-border bg-background">
            <Sparkles className="h-3 w-3" />
          </span>
        </Link>
      </div>
      <TooltipProvider delayDuration={120} skipDelayDuration={80}>
        <nav
          aria-label={t('navigationLabel')}
          className="flex gap-2 overflow-x-auto p-2 [scrollbar-width:none] md:grid md:grid-cols-1 md:gap-2 md:overflow-visible md:px-3 [&::-webkit-scrollbar]:hidden"
        >
          {navItems.map(({ href: itemHref, icon: Icon, key }) => {
            const href = `/${wsId}${itemHref ? `/${itemHref}` : ''}`;
            const isActive = itemHref
              ? pathname.startsWith(href)
              : pathname === `/${wsId}`;
            const label = t(`nav.${key}`);

            return (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <Link
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={label}
                    className={cn(
                      'group flex h-14 min-w-20 shrink-0 flex-col items-center justify-center gap-1 border-2 border-transparent text-muted-foreground transition duration-200 hover:border-border hover:bg-dynamic-cyan/15 hover:text-foreground active:translate-x-0.5 active:translate-y-0.5 md:h-16 md:min-w-0',
                      isActive &&
                        'border-border bg-primary text-primary-foreground shadow-[4px_4px_0_var(--border)] hover:bg-primary hover:text-primary-foreground'
                    )}
                    href={href}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="max-w-full truncate px-1 font-black text-[0.62rem] md:hidden">
                      {label}
                    </span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent
                  className="hidden rounded-none border-2 border-border bg-background px-3 py-2 font-black text-foreground text-xs shadow-[4px_4px_0_var(--border)] md:block"
                  side="right"
                  sideOffset={12}
                >
                  {label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </TooltipProvider>
    </aside>
  );
}
