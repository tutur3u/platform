'use client';

import {
  CircleDot,
  Code2,
  FolderGit2,
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

const NAV_ITEMS = [
  { href: '', icon: Code2, labelKey: 'code', segment: 'code' },
  {
    href: '/commits',
    icon: GitCommitHorizontal,
    labelKey: 'commits',
    segment: 'commits',
  },
  {
    href: '/issues',
    icon: CircleDot,
    labelKey: 'issues',
    segment: 'issues',
  },
  {
    href: '/pulls',
    icon: GitPullRequest,
    labelKey: 'pull_requests',
    segment: 'pulls',
  },
  {
    href: '/actions',
    icon: Play,
    labelKey: 'actions',
    segment: 'actions',
  },
  {
    href: '/branches',
    icon: GitBranch,
    labelKey: 'branches',
    segment: 'branches',
  },
  { href: '/tags', icon: Tag, labelKey: 'tags', segment: 'tags' },
  {
    href: '/releases',
    icon: FolderGit2,
    labelKey: 'releases',
    segment: 'releases',
  },
  {
    href: '/contributors',
    icon: Users,
    labelKey: 'contributors',
    segment: 'contributors',
  },
] as const;

export function Structure({
  children,
  owner,
  repository,
}: {
  children: ReactNode;
  owner: string;
  repository: string;
}) {
  const pathname = usePathname();
  const t = useTranslations('git');
  const basePath = `/${owner}/${repository}`;
  const relativePath = pathname.slice(basePath.length).replace(/^\/+/u, '');
  const activeView = relativePath.split('/')[0] || 'overview';

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-root-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-root-background/85">
        <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-2 px-3 sm:px-4">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 rounded-md p-1 font-semibold transition-colors hover:bg-foreground/5"
          >
            <span className="grid size-7 place-items-center rounded-md border bg-muted/60">
              <GitBranch className="h-4 w-4" />
            </span>
            <span className="hidden lg:inline">Tuturuuu Git</span>
          </Link>
          <Separator orientation="vertical" className="h-5" />
          <nav className="min-w-0 flex-1 truncate font-mono text-xs sm:text-sm">
            <Link
              href={`https://github.com/${owner}`}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {owner}
            </Link>
            <span className="px-1 text-muted-foreground">/</span>
            <Link href={basePath} className="font-semibold">
              {repository}
            </Link>
          </nav>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild className="size-8" size="icon" variant="ghost">
                <Link href="/-/internal/repositories" aria-label={t('admin')}>
                  <Settings2 className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('admin')}</TooltipContent>
          </Tooltip>
        </div>
        <div className="mx-auto max-w-[1600px] overflow-x-auto px-2 sm:px-3">
          <nav className="flex min-w-max items-center gap-0.5">
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
                  aria-label={t(item.labelKey)}
                  className={cn(
                    'relative flex h-9 items-center gap-1.5 rounded-t-md px-2.5 text-muted-foreground text-xs transition-colors hover:bg-foreground/5 hover:text-foreground',
                    active &&
                      'bg-foreground/[0.045] font-medium text-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{t(item.labelKey)}</span>
                  {active && (
                    <span className="absolute inset-x-2 bottom-0 h-px bg-foreground" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-4">
        {children}
      </main>
    </div>
  );
}
