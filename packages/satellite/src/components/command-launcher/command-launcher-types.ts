import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import type {
  LaunchableAppWorkspacePathResolver,
  LaunchableWorkspace,
} from '@tuturuuu/utils/launchable-apps';
import type { ReactNode } from 'react';
import type { CommandLauncherTab } from './command-launcher-tabs';
import type { CommandLauncherHostApp } from './command-launcher-utils';

/**
 * `quick-create` opens the center scoped to Actions with bare digit shortcuts
 * for the first ten visible actions; `default` is the regular search session.
 */
export type CommandCenterMode = 'default' | 'quick-create';

export type CommandCenterOpenOptions = {
  mode?: CommandCenterMode;
  query?: string;
  /** Element to focus again when the center closes. */
  returnFocus?: HTMLElement | null;
  scope?: CommandLauncherTab;
};

export type CommandLauncherNavItem = {
  aliases?: readonly string[];
  external?: boolean;
  group?: string;
  href: string;
  icon?: ReactNode;
  keywords?: readonly string[];
  subtitle?: string | null;
  title: string;
};

export type CommandLauncherExtraSectionContext = {
  activeTab: CommandLauncherTab;
  isOpen: boolean;
  labels: GlobalCommandLauncherLabels;
  mode: CommandCenterMode;
  onClose: () => void;
  query: string;
  setQuery: (query: string) => void;
};

export type GlobalCommandLauncherLabels = {
  apps: string;
  askMira: string;
  askMiraDescription: string;
  createTask: string;
  createTaskDescription: string;
  recent: string;
  suggestions: string;
  back: string;
  categories: string;
  all: string;
  actions: string;
  close: string;
  copyId: string;
  copyLink: string;
  current: string;
  currentApp: string;
  currentWorkspace: string;
  empty: string;
  emptyDescription: string;
  errorWorkspaces: string;
  guest: string;
  itemActions: string;
  loadingWorkspaces: string;
  match: string;
  navigate: string;
  navigation: string;
  offline: string;
  open: string;
  openApp: string;
  openInNewTab: string;
  openWorkspace: string;
  personal: string;
  placeholder: string;
  retry: string;
  scope: string;
  searchHint: string;
  searchingWorkspaces: string;
  select: string;
  title: string;
  tasks: string;
  workspaces: string;
};

export type CommandLauncherFallbackActions = {
  /** Offer "Ask Mira": the query becomes a Mira draft in this workspace. */
  askMira?: boolean;
  /** Offer "Create task": the query fills the Tasks composer's title. */
  createTask?: boolean;
};

export type GlobalCommandLauncherProps = {
  currentApp: CommandLauncherHostApp;
  currentWorkspaceId?: string | null;
  defaultTab?: CommandLauncherTab;
  enableTasks?: boolean;
  extraSections?:
    | ReactNode
    | ((context: CommandLauncherExtraSectionContext) => ReactNode);
  /**
   * Signed-in follow-ups shown under the results and when nothing matches.
   * A host whose own sections already create tasks from the query turns
   * `createTask` off.
   */
  fallbackActions?: CommandLauncherFallbackActions;
  labels?: Partial<GlobalCommandLauncherLabels>;
  /**
   * Localized labels resolved on first open, for hosts that mount the
   * launcher outside their intl provider. Keep the function identity stable.
   */
  labelsLoader?: () => Promise<Partial<GlobalCommandLauncherLabels>>;
  /**
   * One center serves the whole document. The mounted launcher with the
   * highest priority owns Ctrl/Cmd+K and renders the dialog; the latest mount
   * wins a tie. Product launchers mounted inside their own provider tree (for
   * example Tasks or Finance) use a higher priority than the shell launcher so
   * their sections keep access to product context.
   */
  instancePriority?: number;
  navItems?: readonly CommandLauncherNavItem[];
  onNavigate?: (url: string) => void;
  /** False when the host renders its own Recent section. */
  showRecent?: boolean;
  workspacePathResolver?: LaunchableAppWorkspacePathResolver;
};

export type LauncherWorkspace = InternalApiWorkspaceSummary &
  LaunchableWorkspace;

export const DEFAULT_LABELS: GlobalCommandLauncherLabels = {
  actions: 'Actions',
  all: 'All',
  apps: 'Apps',
  askMira: 'Ask Mira',
  askMiraDescription: 'Opens as a Mira draft. Nothing is sent.',
  createTask: 'Create task',
  createTaskDescription: 'Opens the task form with this title',
  recent: 'Recent',
  suggestions: 'Suggestions',
  back: 'back',
  categories: 'Search category',
  close: 'close',
  copyId: 'Copy ID',
  copyLink: 'Copy link',
  current: 'Current',
  currentApp: 'Current app',
  currentWorkspace: 'Current workspace',
  empty: 'No command found',
  emptyDescription: 'Try a workspace, app, page, or a closer spelling.',
  errorWorkspaces: 'Could not load workspaces',
  guest: 'Guest',
  itemActions: 'actions',
  loadingWorkspaces: 'Loading workspaces',
  match: 'Match',
  navigate: 'navigate',
  navigation: 'Navigation',
  offline: 'Offline. Results load when you reconnect.',
  open: 'Open',
  openApp: 'Open app',
  openInNewTab: 'Open in new tab',
  openWorkspace: 'Open workspace',
  personal: 'Personal',
  placeholder: 'Search apps, workspaces, and pages...',
  retry: 'Retry',
  scope: 'scope',
  searchHint: 'Type a workspace, app, page, acronym, or close spelling.',
  searchingWorkspaces: 'Searching workspaces',
  select: 'select',
  title: 'Command Launcher',
  tasks: 'Tasks',
  workspaces: 'Workspaces',
};
