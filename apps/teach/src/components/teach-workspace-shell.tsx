import {
  BarChart3,
  BookOpenCheck,
  CalendarCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  Library,
  LogOut,
  Settings,
} from '@tuturuuu/icons';
import type {
  TeachBootstrapResponse,
  TulearnWorkspaceSummary,
} from '@tuturuuu/internal-api';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { TeachThemeControl } from './teach-theme-control';

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

export async function TeachWorkspaceShell({
  bootstrap,
  children,
  workspace,
  wsId,
}: {
  bootstrap: TeachBootstrapResponse;
  children: ReactNode;
  workspace: TulearnWorkspaceSummary;
  wsId: string;
}) {
  const t = await getTranslations('teachShell');

  return (
    <>
      <header className="sticky top-0 z-30 border-border border-b-2 bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <Link className="flex min-w-0 items-center gap-2" href={`/${wsId}`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-dynamic-yellow/15">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-black leading-none">Teach</span>
              <span className="block truncate text-muted-foreground text-xs">
                {workspace.name ?? t('workspaceFallback')}
              </span>
            </span>
          </Link>
          <nav className="ml-auto hidden min-w-0 items-center gap-1 overflow-x-auto lg:flex">
            {navItems.map(({ href, icon: Icon, key }) => (
              <Link
                className="inline-flex h-9 items-center gap-2 border-2 border-transparent px-2 font-black text-muted-foreground text-xs hover:border-border hover:bg-card hover:text-foreground"
                href={`/${wsId}${href ? `/${href}` : ''}`}
                key={key}
              >
                <Icon className="h-4 w-4" />
                {t(`nav.${key}`)}
              </Link>
            ))}
          </nav>
          <details className="relative hidden md:block">
            <summary className="flex h-9 max-w-44 cursor-pointer list-none items-center truncate border-2 border-border bg-card px-2 font-black text-xs shadow-[2px_2px_0_var(--border)]">
              {workspace.name ?? t('workspaceFallback')}
            </summary>
            <div className="absolute right-0 mt-2 grid w-56 gap-1 border-2 border-border bg-background p-2 shadow-[5px_5px_0_var(--border)]">
              {bootstrap.workspaces.map((candidate) => (
                <Link
                  className="truncate px-2 py-2 font-bold text-xs hover:bg-muted"
                  href={`/${candidate.id}`}
                  key={candidate.id}
                >
                  {candidate.name ?? t('workspaceFallback')}
                </Link>
              ))}
            </div>
          </details>
          <TeachThemeControl compact />
          <a
            className="inline-flex h-9 items-center justify-center border-2 border-border bg-card px-2 shadow-[2px_2px_0_var(--border)]"
            href="/api/auth/logout"
          >
            <LogOut className="h-4 w-4" />
            <span className="sr-only">{t('logout')}</span>
          </a>
        </div>
        <nav className="mx-auto mt-3 flex max-w-7xl gap-2 overflow-x-auto pb-1 lg:hidden">
          {navItems.map(({ href, icon: Icon, key }) => (
            <Link
              className="inline-flex h-9 shrink-0 items-center gap-2 border-2 border-border bg-card px-3 font-black text-xs shadow-[2px_2px_0_var(--border)]"
              href={`/${wsId}${href ? `/${href}` : ''}`}
              key={key}
            >
              <Icon className="h-4 w-4" />
              {t(`nav.${key}`)}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </>
  );
}
