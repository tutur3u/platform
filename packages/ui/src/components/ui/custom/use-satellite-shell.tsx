'use client';
import { ArrowLeft } from '@tuturuuu/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NavLink } from './navigation';
import {
  findActiveNavigation,
  type NavigationState,
} from './satellite-shell-utils';
export function useSatelliteShell({
  pathname,
  links,
  defaultCollapsed = false,
  behavior,
  handleBehaviorChange,
  persistCollapsed,
  backLabel,
}: {
  pathname: string;
  links: (NavLink | null)[];
  defaultCollapsed?: boolean;
  behavior?: 'expanded' | 'collapsed' | 'hover' | 'hidden';
  handleBehaviorChange?: (
    behavior: 'expanded' | 'collapsed' | 'hover' | 'hidden'
  ) => void;
  persistCollapsed?: (collapsed: boolean) => void;
  backLabel: string;
}) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [appsLauncherOpen, setAppsLauncherOpen] = useState(false);
  const [workspaceSelectVisible, setWorkspaceSelectVisible] = useState(false);
  const navigationLinks = useMemo<(NavLink | null)[]>(() => links, [links]);
  const [navState, setNavState] = useState<NavigationState>(() => {
    const activeNavigation = findActiveNavigation({
      currentPath: pathname,
      navLinks: navigationLinks,
    });
    return (
      activeNavigation ?? {
        currentLinks: navigationLinks,
        direction: 'forward',
        history: [],
        titleHistory: [],
      }
    );
  });

  useEffect(() => {
    if (!behavior) return;
    setIsCollapsed(
      behavior === 'collapsed' || behavior === 'hover' || behavior === 'hidden'
    );
  }, [behavior]);

  useEffect(() => {
    if (isCollapsed) setWorkspaceSelectVisible(false);
  }, [isCollapsed]);

  useEffect(() => {
    setNavState((prevState) => {
      const activeNavigation = findActiveNavigation({
        currentPath: pathname,
        navLinks: navigationLinks,
      });
      if (activeNavigation) return activeNavigation;

      if (prevState.history.length > 0) {
        return {
          currentLinks: navigationLinks,
          direction: 'backward',
          history: [],
          titleHistory: [],
        };
      }

      return { ...prevState, currentLinks: navigationLinks };
    });
  }, [navigationLinks, pathname]);

  const backButton: NavLink = useMemo(
    () => ({
      icon: <ArrowLeft className="h-4 w-4" />,
      isBack: true,
      onClick: () => {
        setNavState((prevState) => {
          const newHistory = prevState.history.slice(0, -1);
          return {
            currentLinks: prevState.history.at(-1) ?? navigationLinks,
            direction: 'backward',
            history: newHistory,
            titleHistory: prevState.titleHistory.slice(0, -1),
          };
        });
      },
      title: backLabel,
    }),
    [navigationLinks, backLabel]
  );

  const handleToggle = () => {
    if (behavior === 'hidden') {
      setIsCollapsed(true);
      handleBehaviorChange?.('collapsed');
      return;
    }

    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    if (newCollapsed) setWorkspaceSelectVisible(false);
    persistCollapsed?.(newCollapsed);

    if (behavior === 'expanded' && newCollapsed) {
      handleBehaviorChange?.('collapsed');
    } else if (behavior === 'collapsed' && !newCollapsed) {
      handleBehaviorChange?.('expanded');
    }
  };

  const expandSidebar = useCallback(() => {
    setIsCollapsed(false);
    persistCollapsed?.(false);

    if (behavior !== 'expanded') {
      handleBehaviorChange?.('expanded');
    }
  }, [behavior, handleBehaviorChange, persistCollapsed]);

  const hasOpenDialogs = useCallback(
    () =>
      document.querySelector('[data-state="open"][role="dialog"]') !== null ||
      document.querySelector('[data-state="open"][role="alertdialog"]') !==
        null,
    []
  );
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
  const closeOnMobile = useCallback(() => {
    if (window.innerWidth < 768) setIsCollapsed(true);
  }, []);

  return {
    isCollapsed,
    setIsCollapsed,
    appsLauncherOpen,
    setAppsLauncherOpen,
    workspaceSelectVisible,
    setWorkspaceSelectVisible,
    navState,
    setNavState,
    backButton,
    handleToggle,
    expandSidebar,
    closeOnMobile,
    onMouseEnter,
    onMouseLeave,
  };
}
