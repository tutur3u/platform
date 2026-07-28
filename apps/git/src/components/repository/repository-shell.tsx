import {
  CircleDot,
  Code2,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Play,
  Settings2,
  Tag,
  Users,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { GitHubRepository } from '@/lib/github/types';

const NAV_ITEMS = [
  { href: '', icon: Code2, label: 'Code', segment: 'code' },
  {
    href: '/commits',
    icon: GitCommitHorizontal,
    label: 'Commits',
    segment: 'commits',
  },
  { href: '/issues', icon: CircleDot, label: 'Issues', segment: 'issues' },
  {
    href: '/pulls',
    icon: GitPullRequest,
    label: 'Pull requests',
    segment: 'pulls',
  },
  { href: '/actions', icon: Play, label: 'Actions', segment: 'actions' },
  { href: '/releases', icon: Tag, label: 'Releases', segment: 'releases' },
  {
    href: '/contributors',
    icon: Users,
    label: 'Contributors',
    segment: 'contributors',
  },
] as const;

export function RepositoryShell({
  activeView,
  children,
  repository,
}: {
  activeView: string;
  children: ReactNode;
  repository: GitHubRepository;
}) {
  const basePath = `/${repository.owner.login}/${repository.name}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-[1560px] items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg border bg-foreground text-background">
              <GitBranch className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">Tuturuuu Git</span>
          </Link>
          <Separator orientation="vertical" className="h-5" />
          <nav className="min-w-0 flex-1 truncate text-sm">
            <Link
              href={repository.owner.html_url}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {repository.owner.login}
            </Link>
            <span className="px-1 text-muted-foreground">/</span>
            <Link href={basePath} className="font-semibold">
              {repository.name}
            </Link>
          </nav>
          <Button asChild size="sm" variant="ghost">
            <Link href="/-/internal/repositories">
              <Settings2 className="mr-2 h-4 w-4" />
              <span className="hidden md:inline">Admin</span>
            </Link>
          </Button>
        </div>
        <div className="mx-auto max-w-[1560px] overflow-x-auto px-3">
          <nav className="flex min-w-max gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active =
                item.segment === 'code'
                  ? activeView === 'overview' ||
                    activeView === 'tree' ||
                    activeView === 'blob'
                  : activeView === item.segment ||
                    (item.segment === 'pulls' && activeView === 'pull');

              return (
                <Link
                  key={item.segment}
                  href={`${basePath}${item.href}`}
                  className={cn(
                    'relative flex h-11 items-center gap-2 px-3 text-muted-foreground text-sm transition-colors hover:text-foreground',
                    active && 'font-medium text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1560px] px-4 py-6">
        {children}
      </main>
    </div>
  );
}
