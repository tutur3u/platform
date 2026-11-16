import type { GlobalCommandLauncherLabels } from './command-launcher-types';

// next-intl translators are typed per namespace; accept any of them.
type Translate = (key: any, values?: Record<string, string>) => string;

/**
 * Every label maps to one key of the shared `command_launcher` message
 * namespace, which every consumer app bundle ships. The messages coverage test
 * reads this table, so a missing key fails before a VI user sees English.
 */
export const COMMAND_LAUNCHER_MESSAGE_KEYS = {
  actions: 'scopes.actions',
  all: 'scopes.all',
  apps: 'apps',
  askMira: 'ask_mira',
  askMiraDescription: 'ask_mira_description',
  back: 'back',
  categories: 'scopes.label',
  close: 'close',
  copyId: 'copy_id',
  copyLink: 'copy_link',
  createTask: 'create_task',
  createTaskDescription: 'create_task_description',
  current: 'current',
  currentApp: 'current_app',
  currentWorkspace: 'current_workspace',
  empty: 'empty',
  emptyDescription: 'empty_description',
  errorWorkspaces: 'error_workspaces',
  guest: 'guest',
  itemActions: 'item_actions',
  loadingWorkspaces: 'loading_workspaces',
  match: 'match',
  navigate: 'navigate',
  navigation: 'navigation',
  offline: 'offline',
  open: 'open',
  openApp: 'open_app',
  openInNewTab: 'open_in_new_tab',
  openWorkspace: 'open_workspace',
  personal: 'personal',
  placeholder: 'placeholder',
  recent: 'recent',
  retry: 'retry',
  scope: 'scope',
  searchHint: 'search_hint',
  searchingWorkspaces: 'searching_workspaces',
  select: 'select',
  suggestions: 'suggestions',
  tasks: 'scopes.tasks',
  title: 'title',
  workspaces: 'workspaces',
} as const satisfies Record<keyof GlobalCommandLauncherLabels, string>;

const LABEL_NAMES = Object.keys(
  COMMAND_LAUNCHER_MESSAGE_KEYS
) as (keyof GlobalCommandLauncherLabels)[];

/**
 * Localized labels from a `command_launcher` translator. `palette` keeps the
 * existing `command_palette` copy (scope tabs, title, placeholder, empty
 * state) for hosts that already ship it: Web, Workspace, Tasks and Finance.
 */
export function buildCommandLauncherLabels({
  launcher,
  palette,
}: {
  launcher: Translate;
  palette?: Translate;
}): GlobalCommandLauncherLabels {
  const labels = Object.fromEntries(
    LABEL_NAMES.map((name) => [
      name,
      launcher(COMMAND_LAUNCHER_MESSAGE_KEYS[name]),
    ])
  ) as GlobalCommandLauncherLabels;
  if (!palette) return labels;
  return {
    ...labels,
    actions: palette('tabs.actions'),
    all: palette('tabs.all'),
    apps: palette('tabs.apps'),
    categories: palette('tabs.label'),
    empty: palette('no_results'),
    emptyDescription: palette('try_searching'),
    loadingWorkspaces: palette('loading_workspaces'),
    navigation: palette('tabs.navigate'),
    placeholder: palette('search_placeholder_power'),
    tasks: palette('tabs.tasks'),
    title: palette('title'),
  };
}

/** Labels from a raw `command_launcher` messages object (no intl runtime). */
export function buildCommandLauncherLabelsFromMessages(
  messages: unknown
): Partial<GlobalCommandLauncherLabels> {
  const labels: Partial<GlobalCommandLauncherLabels> = {};
  for (const name of LABEL_NAMES) {
    let value: unknown = messages;
    for (const part of COMMAND_LAUNCHER_MESSAGE_KEYS[name].split('.')) {
      value =
        value && typeof value === 'object'
          ? (value as Record<string, unknown>)[part]
          : undefined;
    }
    if (typeof value === 'string') labels[name] = value;
  }
  return labels;
}
