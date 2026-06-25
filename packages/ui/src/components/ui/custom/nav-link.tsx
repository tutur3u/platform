'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Pin,
  PinOff,
  Sparkles,
} from '@tuturuuu/icons';
import { getWorkspaceConfigIdList } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '../badge';
import { Button } from '../button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';
import type { NavLink as NavLinkType } from './navigation';

function matchesPathPrefix(targetPath: string, pathPrefix: string) {
  return targetPath === pathPrefix || targetPath.startsWith(`${pathPrefix}/`);
}

function getComparablePath(target?: string) {
  if (!target) return null;

  try {
    const base =
      typeof window === 'undefined'
        ? 'https://tuturuuu.local'
        : window.location.origin;
    return new URL(target, base).pathname;
  } catch {
    return target.split(/[?#]/u)[0] || target;
  }
}

function matchesNavigationTarget(
  pathname: string,
  target: string,
  matchExact = false
) {
  const isWildcard = target.endsWith('/*');
  const normalizedTarget = isWildcard
    ? target.slice(0, -2).replace(/\/+$/u, '') || '/'
    : target;

  if (isWildcard) return matchesPathPrefix(pathname, normalizedTarget);

  return matchExact
    ? pathname === normalizedTarget
    : matchesPathPrefix(pathname, normalizedTarget);
}

interface NavLinkProps {
  wsId: string;
  link: NavLinkType;
  isCollapsed: boolean;
  onSubMenuClick: (links: (NavLinkType | null)[], title: string) => void;
  onClick: () => void;
}

export function NavLink({
  wsId,
  link,
  isCollapsed,
  onSubMenuClick,
  onClick,
}: NavLinkProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const { title, icon, href, children, newTab, onClick: onLinkClick } = link;
  const hasChildren = children && children.length > 0;
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  // Recursive function to check if any nested child matches the pathname
  const hasActiveChild = (navLinks: (NavLinkType | null)[]): boolean => {
    return (
      navLinks?.some((child) => {
        const childTargets = [child?.href, ...(child?.aliases ?? [])]
          .map(getComparablePath)
          .filter((target): target is string => Boolean(target));
        const childMatches = childTargets.some((target) =>
          matchesNavigationTarget(pathname, target, child?.matchExact)
        );

        if (childMatches) return true;

        if (child?.children) {
          return hasActiveChild(child.children);
        }

        return false;
      }) ?? false
    );
  };

  const activeTargets = [href, ...(link.aliases ?? [])]
    .map(getComparablePath)
    .filter((target): target is string => Boolean(target));
  const isActive =
    activeTargets.some((target) =>
      matchesNavigationTarget(pathname, target, link.matchExact)
    ) ||
    (children && hasActiveChild(children));

  const isDisabled = link.disabled || link.tempDisabled;
  const isTierRestricted = link.tempDisabled && link.requiredWorkspaceTier;
  const preferenceQuickAction =
    !isCollapsed && !link.preferenceLocked ? link.preferenceQuickAction : null;
  const preferenceArchiveAction =
    !isCollapsed && !link.preferenceLocked
      ? link.preferenceArchiveAction
      : null;
  const archivedItems = link.preferenceArchivedItems ?? [];

  const content = (
    <>
      <div
        key="nav-content"
        className={cn(
          'flex min-w-0 items-center gap-2',
          isCollapsed ? 'justify-center' : 'flex-1'
        )}
      >
        {icon && <span key="nav-icon">{icon}</span>}
        <span
          key="nav-title"
          className={cn('truncate', isCollapsed && 'hidden')}
        >
          {title}
        </span>
      </div>

      {!isCollapsed && (
        <div className="ml-auto flex h-6 shrink-0 items-center gap-0.5">
          {preferenceArchiveAction && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={preferenceArchiveAction.label}
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/navlink:opacity-100',
                    preferenceArchiveAction.pending &&
                      'pointer-events-none animate-pulse opacity-100'
                  )}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    preferenceArchiveAction.onClick();
                  }}
                >
                  {preferenceArchiveAction.isArchived ? (
                    <ArchiveRestore className="h-3.5 w-3.5" />
                  ) : (
                    <Archive className="h-3.5 w-3.5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>{preferenceArchiveAction.label}</TooltipContent>
            </Tooltip>
          )}

          {preferenceQuickAction && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={preferenceQuickAction.label}
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/navlink:opacity-100',
                    preferenceQuickAction.pending &&
                      'pointer-events-none animate-pulse opacity-100'
                  )}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    preferenceQuickAction.onClick();
                  }}
                >
                  {preferenceQuickAction.isPinned ? (
                    <PinOff className="h-3.5 w-3.5" />
                  ) : (
                    <Pin className="h-3.5 w-3.5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>{preferenceQuickAction.label}</TooltipContent>
            </Tooltip>
          )}

          {(hasChildren || archivedItems.length > 0) &&
            !preferenceArchiveAction &&
            !preferenceQuickAction &&
            !isDisabled && (
              <ChevronRight
                key="nav-chevron"
                className="h-4 w-4 opacity-0 group-hover/navlink:opacity-100"
              />
            )}
        </div>
      )}
    </>
  );

  // Get the badge tier for dialog display
  const getBadgeTier = () => {
    if (!link.requiredWorkspaceTier) return null;
    const tiers = ['FREE', 'PLUS', 'PRO', 'ENTERPRISE'] as const;
    const requiredTiers = Array.isArray(link.requiredWorkspaceTier.requiredTier)
      ? link.requiredWorkspaceTier.requiredTier
      : [link.requiredWorkspaceTier.requiredTier];
    return requiredTiers.reduce(
      (min, tier) => (tiers.indexOf(tier) < tiers.indexOf(min) ? tier : min),
      requiredTiers[0]!
    );
  };

  const shouldResolveQueryParamsFromConfig =
    !!href &&
    !newTab &&
    !!link.deferredQueryParamsFromWorkspaceConfig &&
    (Array.isArray(link.deferredQueryParamsFromWorkspaceConfig)
      ? link.deferredQueryParamsFromWorkspaceConfig
      : [link.deferredQueryParamsFromWorkspaceConfig]
    ).every(
      (deferredConfig) =>
        !deferredConfig.onlyWhenPathPrefix ||
        matchesPathPrefix(pathname, deferredConfig.onlyWhenPathPrefix)
    );

  const deferredConfigs = (
    Array.isArray(link.deferredQueryParamsFromWorkspaceConfig)
      ? link.deferredQueryParamsFromWorkspaceConfig
      : link.deferredQueryParamsFromWorkspaceConfig
        ? [link.deferredQueryParamsFromWorkspaceConfig]
        : []
  ).map((deferredConfig) => ({
    ...deferredConfig,
    queryParam: deferredConfig.queryParam ?? 'excludedGroups',
  }));

  const {
    data: resolvedQueryParamIdLists,
    isLoading: isResolvingHref,
    isError: isResolveHrefError,
  } = useQuery({
    queryKey: [
      'nav-workspace-config-id-list',
      wsId,
      deferredConfigs.map((deferredConfig) => [
        deferredConfig.configId,
        deferredConfig.queryParam,
      ]),
    ],
    queryFn: async () =>
      Promise.all(
        deferredConfigs.map(async (deferredConfig) => ({
          queryParam: deferredConfig.queryParam,
          ids: await getWorkspaceConfigIdList(wsId, deferredConfig.configId),
        }))
      ),
    enabled: shouldResolveQueryParamsFromConfig,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const effectiveHref =
    shouldResolveQueryParamsFromConfig && href
      ? (() => {
          if (isResolveHrefError) return href;
          if (!resolvedQueryParamIdLists) return undefined;

          const url = new URL(href, window.location.origin);

          for (const deferredConfig of deferredConfigs) {
            url.searchParams.delete(deferredConfig.queryParam);
          }

          for (const resolvedQueryParamIdList of resolvedQueryParamIdLists) {
            if (resolvedQueryParamIdList.ids.length > 0) {
              url.searchParams.set(
                resolvedQueryParamIdList.queryParam,
                resolvedQueryParamIdList.ids.join(',')
              );
            }
          }

          return `${url.pathname}${url.search}${url.hash}`;
        })()
      : href;

  const commonProps = {
    className: cn(
      'group/navlink flex w-full cursor-pointer items-center justify-between rounded-md p-2 font-medium text-sm',
      isCollapsed && 'justify-center',
      isActive && 'bg-accent text-accent-foreground',
      link.preferenceHiddenActive &&
        'bg-dynamic-amber/10 ring-1 ring-dynamic-amber/40',
      link.isBack && 'mb-2 cursor-pointer',
      isResolvingHref && 'pointer-events-none opacity-70',
      isDisabled
        ? 'cursor-not-allowed opacity-50'
        : 'hover:bg-accent hover:text-accent-foreground'
    ),
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      if (isTierRestricted) {
        event.preventDefault();
        setShowUpgradeDialog(true);
        return;
      }
      if (isDisabled || isResolvingHref) {
        event.preventDefault();
        return;
      }
      if (onLinkClick) {
        onLinkClick();
      } else if (hasChildren) {
        event.preventDefault();
        onSubMenuClick(children, title);
      } else if (href) {
        if (shouldResolveQueryParamsFromConfig && !effectiveHref) {
          event.preventDefault();
          return;
        }
        onClick();
      }
    },
  };

  const linkElement =
    archivedItems.length > 0 ? (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" {...commonProps}>
            {content}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="right" className="min-w-56">
          {archivedItems.map((item) => {
            const restoreAction = item.preferenceArchiveAction;

            return (
              <DropdownMenuItem
                key={item.id ?? item.title}
                className="cursor-pointer gap-2"
                disabled={restoreAction?.pending}
                onSelect={(event) => {
                  event.preventDefault();
                  restoreAction?.onClick();
                }}
              >
                {item.icon && (
                  <span className="text-muted-foreground">{item.icon}</span>
                )}
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <ArchiveRestore className="h-4 w-4 text-muted-foreground" />
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : effectiveHref && !isDisabled ? (
      <Link
        href={effectiveHref}
        {...commonProps}
        target={newTab ? '_blank' : '_self'}
      >
        {content}
      </Link>
    ) : (
      <div {...commonProps}>{content}</div>
    );

  const badgeTier = getBadgeTier();

  const upgradeDialog = (
    <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        {/* Header with gradient background */}
        <div
          className={cn(
            'flex flex-col items-center gap-3 px-6 pt-6 pb-4',
            badgeTier === 'PLUS' &&
              'bg-linear-to-b from-dynamic-blue/10 to-transparent',
            badgeTier === 'PRO' &&
              'bg-linear-to-b from-dynamic-purple/10 to-transparent',
            badgeTier === 'ENTERPRISE' &&
              'bg-linear-to-b from-dynamic-amber/10 to-transparent'
          )}
        >
          {/* Icon */}
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full',
              badgeTier === 'PLUS' && 'bg-dynamic-blue/10 text-dynamic-blue',
              badgeTier === 'PRO' && 'bg-dynamic-purple/10 text-dynamic-purple',
              badgeTier === 'ENTERPRISE' &&
                'bg-dynamic-amber/10 text-dynamic-amber'
            )}
          >
            <Sparkles className="h-6 w-6" />
          </div>

          {/* Tier Badge */}
          <Badge
            className={cn(
              'px-3 py-1 font-semibold text-xs',
              badgeTier === 'PLUS' &&
                'border-dynamic-blue/50 bg-dynamic-blue/15 text-dynamic-blue',
              badgeTier === 'PRO' &&
                'border-dynamic-purple/50 bg-dynamic-purple/15 text-dynamic-purple',
              badgeTier === 'ENTERPRISE' &&
                'border-dynamic-amber/50 bg-dynamic-amber/15 text-dynamic-amber'
            )}
            variant="outline"
          >
            {badgeTier}
          </Badge>
        </div>

        <DialogHeader className="px-6 pt-2 pb-4 text-center">
          <DialogTitle className="w-full text-center text-xl">
            {t('nav-upgrade-dialog.title', { tier: badgeTier! })}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t('nav-upgrade-dialog.description', {
              feature: title,
              tier: badgeTier!,
            })}
          </DialogDescription>
        </DialogHeader>

        {/* Notice section */}
        <div className="space-y-3 border-t bg-muted/30 px-6 py-4 text-muted-foreground text-sm">
          <p>{t('nav-upgrade-dialog.rollout_notice')}</p>
          <p>{t('nav-upgrade-dialog.contact_support')}</p>
        </div>

        <DialogFooter className="px-6 py-4">
          <Button
            variant="outline"
            onClick={() => setShowUpgradeDialog(false)}
            className="w-full"
          >
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (isCollapsed) {
    return (
      <>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{linkElement}</TooltipTrigger>
          <TooltipContent side="right">
            <span>{title}</span>
          </TooltipContent>
        </Tooltip>
        {upgradeDialog}
      </>
    );
  }

  return (
    <>
      {linkElement}
      {upgradeDialog}
    </>
  );
}
