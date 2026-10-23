/**
 * Settings dialog URL contract shared by apps/web and every satellite app.
 *
 * `?settingsTab=<tab>` opens the settings dialog on that tab. The legacy
 * `?settingsDialog=open` flag still opens the dialog on its default tab, and
 * writers keep emitting both params so older readers continue to work.
 */

export const SETTINGS_DIALOG_PARAM = 'settingsDialog';
export const SETTINGS_TAB_PARAM = 'settingsTab';
export const SETTINGS_DIALOG_OPEN_VALUE = 'open';

export const SETTINGS_DIALOG_OPEN_INTENT_EVENT =
  'tuturuuu:settings-dialog-open-intent';
export const SETTINGS_DIALOG_CLOSE_INTENT_EVENT =
  'tuturuuu:settings-dialog-close-intent';

/** Account-level tabs every app's settings dialog is expected to expose. */
export const SHARED_SETTINGS_TAB_IDS = {
  accounts: 'accounts',
  appearance: 'appearance',
  keyboardShortcuts: 'keyboard_shortcuts',
  notifications: 'notifications',
  onboardingGuide: 'onboarding_guide',
  profile: 'profile',
  security: 'security',
  sessions: 'sessions',
} as const;

export type SharedSettingsTabId =
  (typeof SHARED_SETTINGS_TAB_IDS)[keyof typeof SHARED_SETTINGS_TAB_IDS];

const SETTINGS_TAB_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export type SettingsDialogQuery = {
  settingsDialog?: string | null;
  settingsTab?: string | null;
};

export type ParsedSettingsDialogQuery = {
  open: boolean;
  tab: string | null;
};

/** Returns a well-formed tab id, or null for empty / malformed values. */
export function sanitizeSettingsTabId(
  value: string | null | undefined
): string | null {
  if (typeof value !== 'string') return null;

  const tab = value.trim().toLowerCase();
  return SETTINGS_TAB_ID_PATTERN.test(tab) ? tab : null;
}

export function parseSettingsDialogQuery(
  query: SettingsDialogQuery
): ParsedSettingsDialogQuery {
  const tab = sanitizeSettingsTabId(query.settingsTab);

  return {
    open: query.settingsDialog === SETTINGS_DIALOG_OPEN_VALUE || tab !== null,
    tab,
  };
}

export function serializeSettingsDialogQuery(tab?: string | null) {
  return {
    settingsDialog: SETTINGS_DIALOG_OPEN_VALUE,
    settingsTab: sanitizeSettingsTabId(tab),
  } as const;
}

export const CLOSED_SETTINGS_DIALOG_QUERY = {
  settingsDialog: null,
  settingsTab: null,
} as const;

/**
 * Picks the tab to render: the requested tab when the dialog offers it,
 * otherwise the fallback (or the first available tab).
 */
export function resolveSettingsTab(
  requested: string | null | undefined,
  availableTabs: readonly string[],
  fallback?: string
): string | undefined {
  const tab = sanitizeSettingsTabId(requested);
  if (tab && availableTabs.includes(tab)) return tab;
  if (fallback && availableTabs.includes(fallback)) return fallback;
  return availableTabs[0];
}

/** Builds `path?…&settingsDialog=open&settingsTab=<tab>` preserving query. */
export function buildSettingsDialogHref(
  href: string,
  tab?: string | null,
  extraParams?: Record<string, string>
): string {
  const hashIndex = href.indexOf('#');
  const hash = hashIndex === -1 ? '' : href.slice(hashIndex);
  const withoutHash = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf('?');
  const path =
    queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  const params = new URLSearchParams(
    queryIndex === -1 ? '' : withoutHash.slice(queryIndex + 1)
  );
  const query = serializeSettingsDialogQuery(tab);

  params.set(SETTINGS_DIALOG_PARAM, query.settingsDialog);
  if (query.settingsTab) params.set(SETTINGS_TAB_PARAM, query.settingsTab);
  else params.delete(SETTINGS_TAB_PARAM);
  for (const [key, value] of Object.entries(extraParams ?? {})) {
    params.set(key, value);
  }

  return `${path}?${params.toString()}${hash}`;
}

/** Params a redirect must carry so a settings deep link survives it. */
export const SETTINGS_DIALOG_DEEP_LINK_PARAMS = [
  SETTINGS_DIALOG_PARAM,
  SETTINGS_TAB_PARAM,
  'settingsBoardId',
  'settingsLinkedProvider',
] as const;

/** Copies settings deep-link params from one query onto another. */
export function copySettingsDialogParams(
  from: URLSearchParams,
  to: URLSearchParams
): void {
  for (const key of SETTINGS_DIALOG_DEEP_LINK_PARAMS) {
    const value = from.get(key);
    if (value !== null) to.set(key, value);
  }
}

/**
 * Opening pushes a history entry so Back closes the dialog; tab switches and
 * closing replace the current entry so they do not pile up history.
 */
export function getSettingsDialogHistoryMode(
  action: 'open' | 'tab' | 'close',
  currentlyOpen: boolean
): 'push' | 'replace' {
  return action === 'open' && !currentlyOpen ? 'push' : 'replace';
}
