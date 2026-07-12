import { GraduationCap, LogOut } from '@tuturuuu/icons';
import type {
  TeachBootstrapResponse,
  TulearnWorkspaceSummary,
} from '@tuturuuu/internal-api';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { TeachThemeControl } from './teach-theme-control';
import { TeachWorkspaceNav } from './teach-workspace-nav';

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
    <div className="min-h-screen overflow-x-hidden bg-root-background">
      <TeachWorkspaceNav wsId={wsId} />
      <main className="min-h-screen pb-28 md:pb-8 md:pl-32">
        <header className="sticky top-0 z-30 px-4 py-2 md:px-8 md:pt-4">
          <div className="mx-auto flex max-w-7xl items-center gap-3 border-2 border-border bg-background/95 p-2 shadow-[5px_5px_0_var(--border)] backdrop-blur">
            <Link className="flex min-w-0 items-center gap-2" href={`/${wsId}`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-dynamic-cyan/15 shadow-[2px_2px_0_var(--border)]">
                <GraduationCap className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-black leading-none">Teach</span>
                <span className="block truncate text-muted-foreground text-xs">
                  {workspace.name ?? t('workspaceFallback')}
                </span>
              </span>
            </Link>
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <details className="relative hidden md:block">
                <summary className="flex h-9 max-w-44 cursor-pointer list-none items-center truncate border-2 border-border bg-card px-2 font-black text-xs shadow-[2px_2px_0_var(--border)] transition-transform active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
                  {workspace.name ?? t('workspaceFallback')}
                </summary>
                <div className="absolute right-0 mt-2 grid w-56 gap-1 border-2 border-border bg-background p-2 shadow-[5px_5px_0_var(--border)]">
                  {bootstrap.workspaces.map((candidate) => (
                    <Link
                      aria-current={candidate.id === wsId ? 'page' : undefined}
                      className="truncate border-2 border-transparent px-2 py-2 font-bold text-xs transition-colors hover:border-border hover:bg-muted aria-[current=page]:border-border aria-[current=page]:bg-dynamic-cyan/15"
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
                className="inline-flex h-9 items-center justify-center border-2 border-border bg-card px-2 shadow-[2px_2px_0_var(--border)] transition-transform active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                href="/api/auth/logout"
              >
                <LogOut className="h-4 w-4" />
                <span className="sr-only">{t('logout')}</span>
              </a>
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
