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

export function LearnerNavDock({
  selectedStudentId,
  wsId,
}: {
  selectedStudentId: string | null;
  wsId: string;
}) {
  const t = useTranslations();
  const pathname = usePathname();

  const makeHref = (itemHref: string) => {
    const query = selectedStudentId ? `?studentId=${selectedStudentId}` : '';
    return `/${wsId}${itemHref}${query}`;
  };

  return (
    <aside className="fixed inset-x-0 bottom-0 z-20 border-border border-t-2 bg-background shadow-[0_-6px_0_var(--border)] md:inset-y-4 md:right-auto md:left-4 md:w-24 md:border-2 md:shadow-[7px_7px_0_var(--border)]">
      <div className="hidden h-24 items-center justify-center md:flex">
        <div className="relative flex h-14 w-14 items-center justify-center border-2 border-border bg-dynamic-yellow/15 text-foreground shadow-[4px_4px_0_var(--border)]">
          <GraduationCap className="h-7 w-7" />
          <span className="absolute -right-2 -bottom-2 flex h-6 w-6 items-center justify-center border-2 border-border bg-background">
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
                      'group flex h-14 min-w-0 flex-col items-center justify-center gap-1 border-2 border-transparent text-muted-foreground transition duration-200 hover:border-border hover:bg-dynamic-yellow/15 hover:text-foreground md:h-16',
                      isActive &&
                        'border-border bg-primary text-primary-foreground shadow-[4px_4px_0_var(--border)] hover:bg-primary hover:text-primary-foreground'
                    )}
                    href={href}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="max-w-full truncate font-black text-[0.62rem] md:hidden">
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

export function LearnerHeader({
  bootstrap,
  selectedStudentId,
  wsId,
}: {
  bootstrap: TulearnBootstrapResponse;
  selectedStudentId: string | null;
  wsId: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const linkedStudents = bootstrap.linkedStudents.filter(
    (student) => student.workspace_id === wsId
  );
  const activeWorkspace =
    bootstrap.workspaces.find((workspace) => workspace.id === wsId) ??
    bootstrap.workspaces[0];

  return (
    <header className="sticky top-0 z-10 px-4 py-2 md:px-8 md:pt-4">
      <div className="mx-auto flex max-w-7xl flex-nowrap items-center gap-3 border-2 border-border bg-background/95 p-2 shadow-[5px_5px_0_var(--border)] backdrop-blur">
        <div className="flex min-w-0 shrink items-center gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-dynamic-yellow/15 text-foreground shadow-[2px_2px_0_var(--border)]">
            <Rocket className="h-5 w-5" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="font-black text-lg tracking-normal">Learn</p>
            <p className="truncate text-muted-foreground text-xs">
              {activeWorkspace?.name ?? t('workspace.untitled')}
            </p>
          </div>
        </div>
        <div className="ml-auto flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <WorkspaceSelect
            bootstrap={bootstrap}
            onChange={(value) => router.push(`/${value}`)}
            value={wsId}
          />
          {linkedStudents.length ? (
            <StudentSelect
              linkedStudents={linkedStudents}
              onChange={(studentId) =>
                router.push(
                  studentId ? `/${wsId}?studentId=${studentId}` : `/${wsId}`
                )
              }
              profileName={
                bootstrap.profile.display_name ?? t('common.learner')
              }
              value={selectedStudentId ?? ''}
            />
          ) : null}
          <div className="hidden h-10 shrink-0 items-center gap-2 border-2 border-border bg-muted px-2.5 font-black text-xs shadow-[2px_2px_0_var(--border)] lg:flex">
            <Flame className="h-4 w-4" />
            <span>{t('home.streak')}</span>
          </div>
          <LanguageSwitcher compact />
          <form action="/api/auth/logout" method="post">
            <Button
              className="h-10 shrink-0 rounded-none border-2 border-border px-3 font-black text-xs shadow-[2px_2px_0_var(--border)] active:translate-x-1 active:translate-y-1 active:shadow-none"
              size="sm"
              type="submit"
              variant="secondary"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden xl:inline">{t('auth.logout')}</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}

function WorkspaceSelect({
  bootstrap,
  onChange,
  value,
}: {
  bootstrap: TulearnBootstrapResponse;
  onChange: (value: string) => void;
  value: string;
}) {
  const t = useTranslations();
  return (
    <label className="relative">
      <span className="sr-only">{t('workspace.switcher')}</span>
      <select
        aria-label={t('workspace.switcher')}
        className="h-10 w-36 shrink-0 rounded-none border-2 border-border bg-background px-3 font-black text-xs shadow-[2px_2px_0_var(--border)] sm:w-44"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {bootstrap.workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name ?? t('workspace.untitled')}
          </option>
        ))}
      </select>
    </label>
  );
}

function StudentSelect({
  linkedStudents,
  onChange,
  profileName,
  value,
}: {
  linkedStudents: TulearnStudentSummary[];
  onChange: (value: string) => void;
  profileName: string;
  value: string;
}) {
  const t = useTranslations();
  return (
    <label>
      <span className="sr-only">{t('settings.linkedStudents')}</span>
      <select
        aria-label={t('settings.linkedStudents')}
        className="h-10 w-36 shrink-0 rounded-none border-2 border-border bg-muted px-3 font-black text-xs shadow-[2px_2px_0_var(--border)] sm:w-44"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{profileName}</option>
        {linkedStudents.map((student) => (
          <option key={student.id} value={student.id}>
            {student.name ?? t('common.learner')}
          </option>
        ))}
      </select>
    </label>
  );
}

export function useSelectedStudentId() {
  return useSearchParams().get('studentId');
}
