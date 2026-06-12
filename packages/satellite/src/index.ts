export {
  SidebarStructure,
  type SidebarStructureProps,
} from './components/sidebar-structure';
export { SatelliteWorkspaceShell } from './components/workspace-shell';
export {
  LOCALE_COOKIE_NAME,
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
  THEME_COOKIE_NAME,
} from './constants/common';
export {
  SIDEBAR_BEHAVIOR_COOKIE_NAME as SIDEBAR_BEHAVIOR_COOKIE,
  SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME as SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE,
  SIDEBAR_COOKIE_OPTIONS,
  type SidebarBehavior,
  SidebarContext,
  SidebarProvider,
  useSidebar,
} from './context/sidebar-context';
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

export {
  getSidebarBehaviorUpdatedAt,
  getSidebarCollapsedState,
  parseSidebarBehavior,
} from './utils/workspace-layout-helpers';
