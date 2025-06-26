'use client';

import { useQuery } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types/db';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import { WorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { ArrowLeft } from '@tuturuuu/ui/icons';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { setCookie } from 'cookies-next';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, Suspense, useEffect, useState } from 'react';
import type { NavLink } from '@/components/navigation';
import { PROD_MODE, SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';
import { useSidebar } from '@/context/sidebar-context';
import { Nav } from './nav';

interface MailProps {
  wsId: string;
  workspace: Workspace | null;
  defaultCollapsed: boolean;
  user: WorkspaceUser | null;
  links: (NavLink | null)[];
  actions: ReactNode;
  userPopover: ReactNode;
  children: ReactNode;
}

export function Structure({
  wsId,
  defaultCollapsed = false,
  user,
  links,
  actions,
  userPopover,
  children,
}: MailProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const { behavior, handleBehaviorChange } = useSidebar();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    if (behavior === 'collapsed' || behavior === 'hover') {
      setIsCollapsed(true);
    } else {
      setIsCollapsed(false);
    }
  }, [behavior]);

  const [navState, setNavState] = useState<{
    currentLinks: (NavLink | null)[];
    history: (NavLink | null)[][];
    titleHistory: (string | null)[];
    direction: 'forward' | 'backward';
  }>(() => {
    for (const link of links) {
      if (link?.children) {
        const isActive = link.children.some(
          (child) =>
            child?.href &&
            (pathname.startsWith(child.href) ||
              child.aliases?.some((alias) => pathname.startsWith(alias)))
        );
        if (isActive) {
          return {
            currentLinks: link.children,
            history: [links],
            titleHistory: [link.title],
            direction: 'forward' as const,
          };
        }
      }
    }
    return {
      currentLinks: links,
      history: [],
      titleHistory: [],
      direction: 'forward' as const,
    };
  });

  useEffect(() => {
    setNavState((prevState) => {
      // Find if any submenu should be active for the current path.
      for (const link of links) {
        if (link?.children) {
          const isActive = link.children.some(
            (child) =>
              child?.href &&
              (pathname.startsWith(child.href) ||
                child.aliases?.some((alias) => pathname.startsWith(alias)))
          );

          if (isActive) {
            // If the active submenu is not the one currently displayed, switch to it.
            if (
              prevState.titleHistory[prevState.titleHistory.length - 1] !==
              link.title
            ) {
              return {
                currentLinks: link.children,
                history: [links],
                titleHistory: [link.title],
                direction: 'forward',
              };
            }
            // It's the correct submenu, do nothing to the state.
            return prevState;
          }
        }
      }

      // If we are in a submenu, but no submenu link is active for the current path,
      // it means we navigated to a top-level page. Go back to the main menu.
      if (prevState.history.length > 0) {
        return {
          currentLinks: links,
          history: [],
          titleHistory: [],
          direction: 'backward',
        };
      }

      // We are at the top level and no submenu is active, do nothing.
      return prevState;
    });
  }, [pathname, links]);

  const handleToggle = () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    setCookie(SIDEBAR_COLLAPSED_COOKIE_NAME, newCollapsed);

    if (behavior === 'expanded' && newCollapsed) {
      handleBehaviorChange('collapsed');
    } else if (behavior === 'collapsed' && !newCollapsed) {
      handleBehaviorChange('expanded');
    }
  };

  const handleNavChange = (
    newLinks: (NavLink | null)[],
    parentTitle: string
  ) => {
    setNavState((prevState) => ({
      currentLinks: newLinks,
      history: [...prevState.history, prevState.currentLinks],
      titleHistory: [...prevState.titleHistory, parentTitle],
      direction: 'forward',
    }));
  };

  const handleNavBack = () => {
    setNavState((prevState) => {
      const previousLinks = prevState.history[prevState.history.length - 1];
      return {
        currentLinks: previousLinks || links,
        history: prevState.history.slice(0, -1),
        titleHistory: prevState.titleHistory.slice(0, -1),
        direction: 'backward',
      };
    });
  };

  const isHoverMode = behavior === 'hover';
  const onMouseEnter = isHoverMode ? () => setIsCollapsed(false) : undefined;
  const onMouseLeave = isHoverMode ? () => setIsCollapsed(true) : undefined;

  const isRootWorkspace = wsId === ROOT_WORKSPACE_ID;

  const getFilteredLinks = (
    linksToFilter: (NavLink | null)[] | undefined
  ): NavLink[] =>
    (linksToFilter || [])
      .map((link) => {
        if (!link) return null;

        if (link.disabled) return null;
        if (link.disableOnProduction && PROD_MODE) return null;
        if (link.requireRootMember && !user?.email?.endsWith('@tuturuuu.com'))
          return null;
        if (link.requireRootWorkspace && !isRootWorkspace) return null;
        if (link.allowedRoles && link.allowedRoles.length > 0) return null;

        if (link.children) {
          const filteredChildren = getFilteredLinks(link.children);
          if (filteredChildren.length === 0) {
            return null;
          }
          return { ...link, children: filteredChildren };
        }

        return link;
      })
      .filter((link): link is NavLink => link !== null);

  const backButton: NavLink = {
    title: t('common.back'),
    icon: <ArrowLeft className="h-4 w-4" />,
    onClick: handleNavBack,
    isBack: true,
  };

  const currentTitle = navState.titleHistory[navState.titleHistory.length - 1];
  const filteredCurrentLinks = getFilteredLinks(navState.currentLinks);

  const matchedLinks = (
    navState.history.length > 0
      ? [backButton, ...filteredCurrentLinks]
      : filteredCurrentLinks
  )
    .filter(
      (link) =>
        link.href &&
        (pathname.startsWith(link.href) ||
          link.aliases?.some((alias) => pathname.startsWith(alias)))
    )
    .sort((a, b) => (b.href?.length || 0) - (a.href?.length || 0));

  const currentLink = matchedLinks?.[0];

  const sidebarHeader = (
    <>
      {isCollapsed || (
        <Link href="/home" className="flex flex-none items-center gap-2">
          <div className="flex-none">
            <Image
              src="/media/logos/transparent.png"
              className="h-6 w-6"
              width={32}
              height={32}
              alt="logo"
            />
          </div>
          <LogoTitle />
        </Link>
      )}

      <Suspense
        fallback={
          <div className="h-10 w-full animate-pulse rounded-lg bg-foreground/5" />
        }
      >
        <WorkspaceSelect
          t={t}
          hideLeading={isCollapsed}
          localUseQuery={useQuery}
        />
      </Suspense>
    </>
  );

  const sidebarContent = (
    <div className="relative h-full overflow-hidden">
      <div
        key={navState.history.length}
        className={cn(
          'absolute flex h-full w-full flex-col transition-transform duration-300 ease-in-out',
          navState.direction === 'forward'
            ? 'animate-in slide-in-from-right'
            : 'animate-in slide-in-from-left'
        )}
      >
        {navState.history.length === 0 ? (
          <Nav
            wsId={wsId}
            isCollapsed={isCollapsed}
            links={filteredCurrentLinks}
            onSubMenuClick={handleNavChange}
            onClick={() => {
              if (window.innerWidth < 768) {
                setIsCollapsed(true);
              }
            }}
          />
        ) : (
          <>
            <Nav
              wsId={wsId}
              isCollapsed={isCollapsed}
              links={[backButton]}
              onSubMenuClick={handleNavChange}
              onClick={() => {
                /* For the back button, we don't want to close the sidebar */
              }}
            />
            {!isCollapsed && currentTitle && (
              <div className="p-2 pt-0">
                <h2 className="line-clamp-1 px-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {currentTitle}
                </h2>
              </div>
            )}
            {!isCollapsed && <div className="mx-4 my-1 border-b" />}
            {filteredCurrentLinks.length > 0 && (
              <div className="scrollbar-none flex-1 overflow-y-auto">
                <Nav
                  wsId={wsId}
                  isCollapsed={isCollapsed}
                  links={filteredCurrentLinks}
                  onSubMenuClick={handleNavChange}
                  onClick={() => {
                    if (window.innerWidth < 768) {
                      setIsCollapsed(true);
                    }
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  const header = null;

  const mobileHeader = (
    <>
      <div className="flex flex-none items-center gap-2">
        <Link href="/home" className="flex flex-none items-center gap-2">
          <Image
            src="/media/logos/transparent.png"
            className="h-8 w-8"
            width={32}
            height={32}
            alt="logo"
          />
        </Link>
      </div>
      <div className="mx-2 h-4 w-px flex-none rotate-30 bg-foreground/20" />
      <div className="flex items-center gap-2 text-lg font-semibold break-all">
        {currentLink?.icon && (
          <div className="flex-none">{currentLink.icon}</div>
        )}
        <span className="line-clamp-1">{currentLink?.title}</span>
      </div>
    </>
  );

  return (
    <div>
      <BaseStructure
        isCollapsed={isCollapsed}
        setIsCollapsed={handleToggle}
        header={header}
        mobileHeader={mobileHeader}
        sidebarHeader={sidebarHeader}
        sidebarContent={sidebarContent}
        actions={actions}
        userPopover={userPopover}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        hideSizeToggle={behavior === 'hover'}
      />
      {children}
    </div>
  );
}
