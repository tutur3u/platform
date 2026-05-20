'use client';

import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { SidebarFooterActions } from '@tuturuuu/ui/custom/sidebar-footer-actions';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { TTR_URL } from '@/constants/common';
import { useSidebar } from '@/context/sidebar-context';
import { Nav } from './nav';
import { WorkspaceSelect } from './workspace-select';

interface StructureProps {
  wsId: string;
  workspace: { tier?: string | null } | null;
  defaultCollapsed: boolean;
  links: (NavLink | null)[];
  actions: ReactNode;
  userPopover: ReactNode;
  children: ReactNode;
}

function matchesPath(pathname: string, target?: string, matchExact?: boolean) {
  if (!target) return false;
  if (matchExact) return pathname === target;
  return pathname === target || pathname.startsWith(`${target}/`);
}

function filterLinks(links: (NavLink | null)[]): (NavLink | null)[] {
  const filtered = links.flatMap((link) => {
    if (!link) return [null];
    if (link.disabled) return [];

    if (link.children?.length) {
      const children = filterLinks(link.children);
      if (!children.some(Boolean)) return [];
      if (children.length === 1) return children;
      return [{ ...link, children }];
    }

    return [link];
  });

  return filtered.reduce<(NavLink | null)[]>((acc, link) => {
    if (link === null && (acc.length === 0 || acc.at(-1) === null)) {
      return acc;
    }
    acc.push(link);
    return acc;
  }, []);
}

function findActiveLink(
  links: (NavLink | null)[],
  pathname: string
): NavLink | null {
  const matches: NavLink[] = [];

  for (const link of links) {
    if (!link) continue;

    if (
      matchesPath(pathname, link.href, link.matchExact) ||
      link.aliases?.some((alias) => matchesPath(pathname, alias))
    ) {
      matches.push(link);
    }

    if (link.children?.length) {
      const child = findActiveLink(link.children, pathname);
      if (child) matches.push(child);
    }
  }

  return (
    matches.sort((a, b) => (b.href?.length ?? 0) - (a.href?.length ?? 0))[0] ??
    null
  );
}

export function Structure({
  wsId,
  workspace,
  defaultCollapsed = false,
  links,
  actions,
  userPopover,
  children,
}: StructureProps) {
  const pathname = usePathname();
  const { behavior, handleBehaviorChange } = useSidebar();
  const [initialized, setInitialized] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [activeLinks, setActiveLinks] = useState<(NavLink | null)[]>(() =>
    filterLinks(links)
  );

  useEffect(() => {
    setInitialized(true);
  }, []);

  useEffect(() => {
    setActiveLinks(filterLinks(links));
  }, [links]);

  useEffect(() => {
    setIsCollapsed(behavior === 'collapsed' || behavior === 'hover');
  }, [behavior]);

  const filteredLinks = useMemo(() => filterLinks(links), [links]);
  const currentLink = useMemo(
    () => findActiveLink(filteredLinks, pathname),
    [filteredLinks, pathname]
  );

  const handleToggle = () => {
    const nextCollapsed = !isCollapsed;
    setIsCollapsed(nextCollapsed);

    if (behavior === 'expanded' && nextCollapsed) {
      handleBehaviorChange('collapsed');
    } else if (behavior === 'collapsed' && !nextCollapsed) {
      handleBehaviorChange('expanded');
    }
  };

  const hasOpenDialogs = useCallback(() => {
    return (
      document.querySelector('[data-state="open"][role="dialog"]') !== null ||
      document.querySelector('[data-state="open"][role="alertdialog"]') !== null
    );
  }, []);

  const isHoverMode = behavior === 'hover';
  const onMouseEnter = isHoverMode
    ? () => {
        if (!hasOpenDialogs()) setIsCollapsed(false);
      }
    : undefined;
  const onMouseLeave = isHoverMode
    ? () => {
        if (!hasOpenDialogs()) setIsCollapsed(true);
      }
    : undefined;

  const sidebarHeader = (
    <>
      {isCollapsed || wsId === ROOT_WORKSPACE_ID || (
        <Link href="/" className="flex flex-none items-center gap-2">
          <TuturuuLogo className="h-6 w-6" width={32} height={32} alt="logo" />
          <LogoTitle />
        </Link>
      )}

      <Suspense
        fallback={
          <div className="h-10 w-full animate-pulse rounded-lg bg-foreground/5" />
        }
      >
        <WorkspaceSelect wsId={wsId} hideLeading={isCollapsed} />
      </Suspense>
    </>
  );

  const sidebarContent = (
    <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
      <Nav
        wsId={wsId}
        isCollapsed={isCollapsed}
        links={activeLinks}
        onSubMenuClick={(children) => setActiveLinks(filterLinks(children))}
        onClick={() => {
          if (window.innerWidth < 768) setIsCollapsed(true);
        }}
      />
    </div>
  );

  const mobileHeader = (
    <>
      <Link href="/" className="flex flex-none items-center gap-2">
        <TuturuuLogo className="h-8 w-8" width={32} height={32} alt="logo" />
      </Link>
      <div className="mx-2 h-4 w-px flex-none rotate-30 bg-foreground/20" />
      <div className="flex min-w-0 items-center gap-2 font-semibold text-lg">
        {currentLink?.icon && (
          <div className="flex-none">{currentLink.icon}</div>
        )}
        <span className="line-clamp-1">{currentLink?.title}</span>
      </div>
    </>
  );

  if (!initialized) return null;

  return (
    <BaseStructure
      isCollapsed={isCollapsed}
      setIsCollapsed={handleToggle}
      header={null}
      mobileHeader={mobileHeader}
      sidebarHeader={sidebarHeader}
      sidebarContent={sidebarContent}
      actions={actions}
      userPopover={userPopover}
      feedbackButton={
        <SidebarFooterActions
          wsId={wsId}
          isCollapsed={isCollapsed}
          showUpgrade={!workspace?.tier || workspace.tier === 'FREE'}
          upgradeHref={`${TTR_URL}/${wsId}/billing`}
          upgradeExternal
        />
      }
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      hideSizeToggle={behavior === 'hover'}
      overlayOnExpand={behavior === 'hover'}
    >
      <div
        className={cn(
          'mx-auto w-full max-w-7xl',
          'rounded-lg border border-border/60 bg-background/80 p-3 shadow-foreground/5 shadow-sm backdrop-blur sm:p-4'
        )}
      >
        {children}
      </div>
    </BaseStructure>
  );
}
