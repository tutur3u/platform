'use client';
import { ArrowLeft } from '@tuturuuu/icons';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { NavLink } from './navigation';
import {
  findActiveNavigation,
  type NavigationState,
} from './satellite-shell-utils';

const mobileQuery = '(max-width: 767px)';
const subscribeMobile = (notify: () => void) => {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
const getIsMobile = () => window.matchMedia(mobileQuery).matches;
const getServerIsMobile = () => false;

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
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    getIsMobile,
    getServerIsMobile
  );
  const [desktopCollapsed, setDesktopCollapsed] = useState(
    behavior ? behavior !== 'expanded' : defaultCollapsed
  );
  const [mobileCollapsed, setMobileCollapsed] = useState(true);
  const isCollapsed = isMobile ? mobileCollapsed : desktopCollapsed;
  const setIsCollapsed = isMobile ? setMobileCollapsed : setDesktopCollapsed;
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
    setDesktopCollapsed(
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
    if (isMobile) {
      setMobileCollapsed((collapsed) => !collapsed);
      return;
    }
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
    if (isMobile) {
      setMobileCollapsed(false);
      return;
    }
    setDesktopCollapsed(false);
    persistCollapsed?.(false);

    if (behavior !== 'expanded') {
      handleBehaviorChange?.('expanded');
    }
  }, [behavior, handleBehaviorChange, persistCollapsed, isMobile]);

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
    if (window.innerWidth < 768) setMobileCollapsed(true);
  }, []);

  return {
    isCollapsed,
    mobileSidebarOpen: !mobileCollapsed,
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
