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
    <aside className="fixed inset-x-0 bottom-0 z-20 border-foreground border-t-2 bg-background shadow-[0_-6px_0_var(--foreground)] md:inset-y-4 md:right-auto md:left-4 md:w-24 md:border-2 md:shadow-[7px_7px_0_var(--foreground)]">
      <div className="hidden h-24 items-center justify-center md:flex">
        <div className="relative flex h-14 w-14 items-center justify-center border-2 border-foreground bg-dynamic-yellow text-foreground shadow-[4px_4px_0_var(--foreground)]">
          <GraduationCap className="h-7 w-7" />
          <span className="absolute -right-2 -bottom-2 flex h-6 w-6 items-center justify-center border-2 border-foreground bg-background">
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
                      'group flex h-14 min-w-0 flex-col items-center justify-center gap-1 border-2 border-transparent text-muted-foreground transition duration-200 hover:border-foreground hover:bg-dynamic-yellow/15 hover:text-foreground md:h-16',
                      isActive &&
                        'border-foreground bg-dynamic-yellow text-foreground shadow-[4px_4px_0_var(--foreground)] hover:bg-dynamic-yellow hover:text-foreground'
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
    <header className="sticky top-0 z-10 px-4 py-3 md:px-8 md:pt-5">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 border-2 border-foreground bg-background p-3 shadow-[7px_7px_0_var(--foreground)]">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center border-2 border-foreground bg-dynamic-yellow text-foreground shadow-[3px_3px_0_var(--foreground)]">
            <Rocket className="h-6 w-6" />
          </div>
          <div>
            <p className="font-black text-xl tracking-normal">Learn</p>
            <p className="text-muted-foreground text-sm">
              {activeWorkspace?.name ?? t('workspace.untitled')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <div className="hidden items-center gap-2 border-2 border-foreground bg-dynamic-yellow/15 px-3 py-2 font-black text-sm shadow-[3px_3px_0_var(--foreground)] sm:flex">
            <Flame className="h-4 w-4" />
            {t('home.streak')}
          </div>
          <LanguageSwitcher compact />
          <form action="/api/auth/logout" method="post">
            <Button
              className="h-11 rounded-none border-2 border-foreground font-black shadow-[3px_3px_0_var(--foreground)] active:translate-x-1 active:translate-y-1 active:shadow-none"
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
        className="h-11 min-w-40 rounded-none border-2 border-foreground bg-background px-4 font-black text-sm shadow-[3px_3px_0_var(--foreground)]"
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
        className="h-11 min-w-40 rounded-none border-2 border-foreground bg-dynamic-yellow/15 px-4 font-black text-sm shadow-[3px_3px_0_var(--foreground)]"
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
