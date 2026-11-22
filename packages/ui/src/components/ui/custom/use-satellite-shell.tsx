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
  opensAsOverlay,
  restsCollapsed,
  type SidebarBehavior,
} from './sidebar-behavior';
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

function collapsedForBehavior(
  behavior: SidebarBehavior | undefined,
  defaultCollapsed: boolean
) {
  return restsCollapsed(behavior) || defaultCollapsed;
}

export function useSatelliteShell({
  pathname,
  links,
  defaultCollapsed = false,
  behavior: configuredBehavior,
  holdBehavior = false,
  handleBehaviorChange,
  persistCollapsed,
  backLabel,
}: {
  pathname: string;
  links: (NavLink | null)[];
  defaultCollapsed?: boolean;
  behavior?: SidebarBehavior;
  holdBehavior?: boolean;
  handleBehaviorChange?: (behavior: SidebarBehavior) => void;
  persistCollapsed?: (collapsed: boolean) => void;
  backLabel: string;
}) {
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    getIsMobile,
    getServerIsMobile
  );
  const [behavior, setBehavior] = useState(configuredBehavior);
  const [desktopCollapsed, setDesktopCollapsed] = useState(() =>
    collapsedForBehavior(behavior, defaultCollapsed)
  );
  const [mobileCollapsed, setMobileCollapsed] = useState(true);
  const isCollapsed = isMobile ? mobileCollapsed : desktopCollapsed;
  const setIsCollapsed = isMobile ? setMobileCollapsed : setDesktopCollapsed;
  const [appsLauncherOpen, setAppsLauncherOpen] = useState(false);
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
    if (holdBehavior || behavior === configuredBehavior) return;
    setBehavior(configuredBehavior);
    setDesktopCollapsed(collapsedForBehavior(configuredBehavior, false));
  }, [behavior, configuredBehavior, holdBehavior]);

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
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
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

  // Hover and minimal both open the full sidebar as an overlay.
  const isOverlayMode = opensAsOverlay(behavior);
  const onMouseEnter = isOverlayMode ? () => setIsCollapsed(false) : undefined;
  const onMouseLeave = isOverlayMode ? () => setIsCollapsed(true) : undefined;
  const closeOnMobile = useCallback(() => {
    if (window.innerWidth < 768) setMobileCollapsed(true);
  }, []);

  return {
    behavior,
    isCollapsed,
    mobileSidebarOpen: !mobileCollapsed,
    setIsCollapsed,
    appsLauncherOpen,
    setAppsLauncherOpen,
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
