'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

export const subscribeMobileViewport = (notify: () => void) => {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
export const getIsMobileViewport = () =>
  window.matchMedia(MOBILE_QUERY).matches;
export const getServerIsMobileViewport = () => false;

/**
 * Collapse state for a sidebar shell that is an in-flow rail on desktop and a
 * drawer on phones. The two are independent: the desktop state follows the
 * persisted behavior, while the phone drawer starts closed on every load and
 * opens only on an explicit toggle. `mobileSidebarOpen` is the drawer state
 * alone, so server markup keeps the drawer closed whatever the desktop
 * preference is. `isCollapsed` and `setIsCollapsed` address whichever
 * layout is current.
 */
export function useResponsiveSidebarCollapse(defaultCollapsed = false) {
  const isMobile = useSyncExternalStore(
    subscribeMobileViewport,
    getIsMobileViewport,
    getServerIsMobileViewport
  );
  const [desktopCollapsed, setDesktopCollapsed] = useState(defaultCollapsed);
  const [mobileCollapsed, setMobileCollapsed] = useState(true);
  const toggleMobileSidebar = useCallback(
    () => setMobileCollapsed((collapsed) => !collapsed),
    []
  );

  return {
    isCollapsed: isMobile ? mobileCollapsed : desktopCollapsed,
    isMobile,
    mobileSidebarOpen: !mobileCollapsed,
    setDesktopCollapsed,
    setIsCollapsed: isMobile ? setMobileCollapsed : setDesktopCollapsed,
    toggleMobileSidebar,
  };
}
