// Shared constants
// Shared constants

export { SatelliteWorkspaceShell } from './components/workspace-shell';
export {
  LOCALE_COOKIE_NAME,
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
  THEME_COOKIE_NAME,
} from './constants/common';
// Re-export sidebar context
// Re-export sidebar context
export {
  SIDEBAR_BEHAVIOR_COOKIE_NAME as SIDEBAR_BEHAVIOR_COOKIE,
  type SidebarBehavior,
  SidebarContext,
  SidebarProvider,
  useSidebar,
} from './context/sidebar-context';
// Shared i18n
// Shared i18n
export {
  defaultLocale,
  Link,
  type Locale,
  redirect,
  routing,
  supportedLocales,
  usePathname,
  useRouter,
} from './i18n/routing';
export { DASHBOARD_EMBED_SHELL_CLASSNAME } from './utils/dashboard-embed-shell';

// Utility helpers
// Utility helpers
export {
  getSidebarCollapsedState,
  parseSidebarBehavior,
} from './utils/workspace-layout-helpers';
