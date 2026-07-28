'use client';

import {
  CircleDot,
  Code2,
  ExternalLink,
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
import { Structure as SidebarStructure } from '@tuturuuu/ui/custom/structure';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

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
  const [isCollapsed, setIsCollapsed] = useState(true);
  const basePath = `/${owner}/${repository}`;
  const relativePath = pathname.slice(basePath.length).replace(/^\/+/u, '');
  const activeView = relativePath.split('/')[0] || 'overview';
  const closeOnMobile = () => {
    if (window.innerWidth < 768) setIsCollapsed(true);
  };
  const adminAction = (
    <Button
      asChild
      className="h-9 w-full justify-start gap-2"
      size="sm"
      variant="ghost"
    >
      <Link href="/-/internal/repositories" aria-label={t('admin')}>
        <Settings2 className="h-4 w-4" />
        <span>{t('admin')}</span>
      </Link>
    </Button>
  );
  const adminIcon = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild className="h-9 w-9" size="icon" variant="ghost">
          <Link href="/-/internal/repositories" aria-label={t('admin')}>
            <Settings2 className="h-4 w-4" />
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{t('admin')}</TooltipContent>
    </Tooltip>
  );

  return (
    <SidebarStructure
      actions={<div className="w-full">{adminAction}</div>}
      isCollapsed={isCollapsed}
      mobileHeader={
        <RepositoryBrand
          basePath={basePath}
          owner={owner}
          repository={repository}
        />
      }
      setIsCollapsed={setIsCollapsed}
      sidebarCollapsedWidth="4rem"
      sidebarContent={
        <div className="flex min-h-0 flex-1 flex-col">
          {!isCollapsed ? (
            <div className="mx-2 mb-1 rounded-lg border bg-foreground/[0.02] p-2.5">
              <Link
                className="block truncate font-mono font-semibold text-sm"
                href={basePath}
              >
                {repository}
              </Link>
              <Link
                className="mt-0.5 flex items-center gap-1 truncate text-muted-foreground text-xs hover:text-foreground"
                href={`https://github.com/${owner}`}
              >
                {owner}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          ) : null}
          <nav className="scrollbar-none min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active =
                item.segment === 'code'
                  ? activeView === 'overview' ||
                    activeView === 'tree' ||
                    activeView === 'blob'
                  : activeView === item.segment ||
                    (item.segment === 'pulls' && activeView === 'pull');
              const link = (
                <Link
                  key={item.segment}
                  aria-current={active ? 'page' : undefined}
                  aria-label={t(item.labelKey)}
                  className={cn(
                    'flex h-9 items-center rounded-md text-muted-foreground text-sm transition-colors hover:bg-foreground/5 hover:text-foreground',
                    isCollapsed ? 'justify-center px-0' : 'gap-2 px-2.5',
                    active &&
                      'bg-foreground/[0.065] font-medium text-foreground'
                  )}
                  href={`${basePath}${item.href}`}
                  onClick={closeOnMobile}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!isCollapsed ? (
                    <span className="truncate">{t(item.labelKey)}</span>
                  ) : null}
                </Link>
              );

              return isCollapsed ? (
                <Tooltip key={item.segment}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">
                    {t(item.labelKey)}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div key={item.segment}>{link}</div>
              );
            })}
          </nav>
        </div>
      }
      sidebarHeader={
        <RepositoryBrand
          basePath={basePath}
          collapsed={isCollapsed}
          owner={owner}
          repository={repository}
        />
      }
      userPopover={adminIcon}
    >
      <div className="mx-auto w-full max-w-[1600px]">{children}</div>
    </SidebarStructure>
  );
}

function RepositoryBrand({
  basePath,
  collapsed = false,
  owner,
  repository,
}: {
  basePath: string;
  collapsed?: boolean;
  owner: string;
  repository: string;
}) {
  return (
    <Link
      aria-label={`${owner}/${repository}`}
      className={cn(
        'flex min-w-0 items-center rounded-md font-semibold transition-colors hover:bg-foreground/5',
        collapsed ? 'justify-center p-1' : 'gap-2 p-1'
      )}
      href={basePath}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-muted/60">
        <GitBranch className="h-4 w-4" />
      </span>
      {!collapsed ? (
        <span className="min-w-0 truncate font-mono text-sm">
          {owner}/{repository}
        </span>
      ) : null}
    </Link>
  );
}
