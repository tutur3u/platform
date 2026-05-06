'use client';

import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Flame,
  GraduationCap,
  HeartPulse,
  Home,
  LineChart,
  LogOut,
  MessageCircle,
  Rocket,
  Settings,
  Sparkles,
} from '@tuturuuu/icons';
import type {
  TulearnBootstrapResponse,
  TulearnStudentSummary,
  TulearnWorkspaceSummary,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { LanguageSwitcher } from './language-switcher';

const navItems = [
  { key: 'home', href: '', icon: Home },
  { key: 'practice', href: '/practice', icon: HeartPulse },
  { key: 'aiChat', href: '/ai-chat', icon: MessageCircle },
  { key: 'courses', href: '/courses', icon: BookOpen },
  { key: 'assignments', href: '/assignments', icon: ClipboardCheck },
  { key: 'reports', href: '/reports', icon: LineChart },
  { key: 'marks', href: '/marks', icon: BarChart3 },
  { key: 'settings', href: '/settings', icon: Settings },
] as const;

export function LearnerShell({
  bootstrap,
  children,
  wsId,
}: {
  bootstrap: TulearnBootstrapResponse;
  children: ReactNode;
  wsId: string;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const selectedStudentId = useSearchParams().get('studentId');
  const linkedStudents = bootstrap.linkedStudents.filter(
    (student) => student.workspace_id === wsId
  );
  const activeWorkspace =
    bootstrap.workspaces.find((workspace) => workspace.id === wsId) ??
    bootstrap.workspaces[0];

  const makeHref = (itemHref: string) => {
    const query = selectedStudentId ? `?studentId=${selectedStudentId}` : '';
    return `/${wsId}${itemHref}${query}`;
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-dynamic-yellow/10">
      <aside className="fixed inset-x-0 bottom-0 z-20 border-foreground border-t-2 bg-background shadow-[0_-6px_0_var(--foreground)] md:inset-y-4 md:right-auto md:left-4 md:w-24 md:border-2 md:shadow-[7px_7px_0_var(--foreground)]">
        <div className="hidden h-24 items-center justify-center md:flex">
          <div className="relative flex h-14 w-14 items-center justify-center border-2 border-foreground bg-dynamic-yellow text-foreground shadow-[4px_4px_0_var(--foreground)]">
            <GraduationCap className="h-7 w-7" />
            <span className="absolute -right-2 -bottom-2 flex h-6 w-6 items-center justify-center border-2 border-foreground bg-dynamic-orange text-primary-foreground">
              <Sparkles className="h-3 w-3" />
            </span>
          </div>
        </div>
        <TooltipProvider delayDuration={120} skipDelayDuration={80}>
          <nav className="grid grid-cols-4 gap-2 p-2 md:grid-cols-1 md:gap-3 md:px-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const href = makeHref(item.href);
              const label = t(`navigation.${item.key}`);
              const isActive =
                item.href === ''
                  ? pathname === `/${wsId}`
                  : pathname.startsWith(`/${wsId}${item.href}`);

              return (
                <Tooltip key={item.key}>
                  <TooltipTrigger asChild>
                    <Link
                      aria-label={label}
                      className={cn(
                        'group flex h-14 min-w-0 flex-col items-center justify-center gap-1 border-2 border-transparent text-muted-foreground transition duration-200 hover:-translate-y-0.5 hover:border-foreground hover:bg-dynamic-yellow/15 hover:text-foreground md:h-16',
                        isActive &&
                          'border-foreground bg-dynamic-yellow text-foreground shadow-[4px_4px_0_var(--foreground)] hover:bg-dynamic-yellow hover:text-foreground'
                      )}
                      href={href}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="max-w-full truncate font-medium text-[0.62rem] md:hidden">
                        {label}
                      </span>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent
                    className="hidden rounded-none border-2 border-foreground bg-background px-3 py-2 font-black text-foreground text-xs shadow-[4px_4px_0_var(--foreground)] md:block"
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
      <main className="min-h-screen pb-44 md:pb-8 md:pl-32">
        <header className="sticky top-0 z-10 px-4 py-3 md:px-8 md:pt-5">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 border-2 border-foreground bg-background p-3 shadow-[7px_7px_0_var(--foreground)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center border-2 border-foreground bg-dynamic-yellow text-foreground shadow-[3px_3px_0_var(--foreground)]">
                <Rocket className="h-6 w-6" />
              </div>
              <div>
                <p className="font-bold text-xl tracking-normal">Learn</p>
                <p className="text-muted-foreground text-sm">
                  {activeWorkspace?.name ?? t('workspace.untitled')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative">
                <span className="sr-only">{t('workspace.switcher')}</span>
                <select
                  aria-label={t('workspace.switcher')}
                  className="h-11 min-w-40 rounded-none border-2 border-foreground bg-background px-4 font-bold text-sm shadow-[3px_3px_0_var(--foreground)]"
                  onChange={(event) => router.push(`/${event.target.value}`)}
                  value={wsId}
                >
                  {bootstrap.workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name ?? t('workspace.untitled')}
                    </option>
                  ))}
                </select>
              </label>
              {linkedStudents.length ? (
                <label>
                  <span className="sr-only">
                    {t('settings.linkedStudents')}
                  </span>
                  <select
                    aria-label={t('settings.linkedStudents')}
                    className="h-11 min-w-40 rounded-none border-2 border-foreground bg-dynamic-blue/10 px-4 font-bold text-dynamic-blue text-sm shadow-[3px_3px_0_var(--foreground)]"
                    onChange={(event) => {
                      const studentId = event.target.value;
                      router.push(
                        studentId
                          ? `/${wsId}?studentId=${studentId}`
                          : `/${wsId}`
                      );
                    }}
                    value={selectedStudentId ?? ''}
                  >
                    <option value="">
                      {bootstrap.profile.display_name ?? t('common.learner')}
                    </option>
                    {linkedStudents.map((student: TulearnStudentSummary) => (
                      <option key={student.id} value={student.id}>
                        {student.name ?? t('common.learner')}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="hidden items-center gap-2 border-2 border-foreground bg-dynamic-orange/10 px-3 py-2 font-black text-dynamic-orange text-sm shadow-[3px_3px_0_var(--foreground)] sm:flex">
                <Flame className="h-4 w-4" />
                {t('home.streak')}
              </div>
              <LanguageSwitcher compact />
              <form action="/api/auth/logout" method="post">
                <Button
                  className="h-11 rounded-none border-2 border-foreground font-bold shadow-[3px_3px_0_var(--foreground)] active:translate-x-1 active:translate-y-1 active:shadow-none"
                  size="sm"
                  type="submit"
                  variant="secondary"
                >
                  <LogOut className="h-4 w-4" />
                  {t('auth.logout')}
                </Button>
              </form>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

export function NoWorkspaceState() {
  const t = useTranslations();
  return (
    <div className="flex min-h-screen items-center justify-center bg-dynamic-yellow/10 p-6">
      <div className="max-w-lg border-2 border-foreground bg-background p-8 text-center shadow-[9px_9px_0_var(--foreground)]">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center border-2 border-foreground bg-dynamic-orange/15 text-dynamic-orange shadow-[4px_4px_0_var(--foreground)]">
          <GraduationCap className="h-8 w-8" />
        </div>
        <h1 className="font-bold text-3xl tracking-normal">
          {t('workspace.empty')}
        </h1>
        <p className="mt-3 text-muted-foreground leading-7">
          {t('auth.subtitle')}
        </p>
      </div>
    </div>
  );
}

export type { TulearnWorkspaceSummary };
