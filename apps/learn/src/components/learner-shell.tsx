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
    <div className="min-h-screen overflow-x-hidden bg-muted/25">
      <aside className="fixed inset-x-0 bottom-0 z-20 border-border border-t bg-background/95 shadow-2xl backdrop-blur-xl md:inset-y-4 md:right-auto md:left-4 md:w-24 md:rounded-[2rem] md:border">
        <div className="hidden h-24 items-center justify-center md:flex">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-[1.35rem] bg-dynamic-green text-primary-foreground shadow-sm">
            <GraduationCap className="h-7 w-7" />
            <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full border border-background bg-dynamic-orange text-primary-foreground">
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
                        'group flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl text-muted-foreground transition duration-200 hover:-translate-y-0.5 hover:bg-dynamic-green/10 hover:text-dynamic-green md:h-16',
                        isActive &&
                          'bg-dynamic-green text-primary-foreground shadow-sm hover:bg-dynamic-green hover:text-primary-foreground'
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
                    className="hidden rounded-2xl border border-dynamic-green/30 bg-dynamic-green/10 px-3 py-2 font-semibold text-dynamic-green text-xs shadow-xl backdrop-blur-xl md:block"
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
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 rounded-[1.75rem] border border-border/70 bg-background/90 p-3 shadow-sm backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-dynamic-green/15 text-dynamic-green">
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
                  className="h-11 min-w-40 rounded-2xl border border-border bg-background px-4 font-medium text-sm shadow-sm"
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
                    className="h-11 min-w-40 rounded-2xl border border-dynamic-blue/25 bg-dynamic-blue/10 px-4 font-medium text-dynamic-blue text-sm shadow-sm"
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
              <div className="hidden items-center gap-2 rounded-2xl border border-dynamic-orange/25 bg-dynamic-orange/10 px-3 py-2 font-semibold text-dynamic-orange text-sm sm:flex">
                <Flame className="h-4 w-4" />
                {t('home.streak')}
              </div>
              <LanguageSwitcher compact />
              <form action="/api/auth/logout" method="post">
                <Button
                  className="h-11 rounded-2xl"
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
    <div className="flex min-h-screen items-center justify-center bg-muted/25 p-6">
      <div className="max-w-lg rounded-[2rem] border border-dynamic-orange/25 bg-background p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-dynamic-orange/15 text-dynamic-orange">
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
