'use client';

import { parseAsString, useQueryStates } from 'nuqs';
import { useCallback } from 'react';
import {
  SETTINGS_DIALOG_DEEP_LINK_PARAMS,
  parseSettingsDialogQuery,
} from './settings-dialog-url';

export const UPGRADE_DIALOG_PARAM = 'upgradeDialog';
export const UPGRADE_TAB_PARAM = 'upgradeTab';
export const UPGRADE_DIALOG_OPEN_VALUE = 'open';
export const UPGRADE_TAB_IDS = ['plans', 'compare', 'current'] as const;
export type UpgradeTabId = (typeof UPGRADE_TAB_IDS)[number];

const QUERY_OPTIONS = { scroll: false, shallow: true } as const;

export const CLOSED_UPGRADE_DIALOG_QUERY = {
  [UPGRADE_DIALOG_PARAM]: null,
  [UPGRADE_TAB_PARAM]: null,
} as const;

/** Settings params cleared when Upgrade opens, so one dialog shows at a time. */
const CLOSED_SETTINGS_QUERY = Object.fromEntries(
  SETTINGS_DIALOG_DEEP_LINK_PARAMS.map((key) => [key, null])
) as Record<(typeof SETTINGS_DIALOG_DEEP_LINK_PARAMS)[number], null>;
const SETTINGS_PARSERS = Object.fromEntries(
  SETTINGS_DIALOG_DEEP_LINK_PARAMS.map((key) => [key, parseAsString])
) as Record<
  (typeof SETTINGS_DIALOG_DEEP_LINK_PARAMS)[number],
  typeof parseAsString
>;

/** Returns the tab id, or `plans` for a missing or unknown value. */
export function resolveUpgradeTab(value: string | null | undefined) {
  return UPGRADE_TAB_IDS.find((id) => id === value) ?? 'plans';
}

/**
 * URL-backed open/tab state of the Upgrade dialog (`?upgradeDialog=open&
 * upgradeTab=compare`). Opening pushes a history entry so Back closes the
 * dialog; switching tabs, closing and swapping from Settings replace the
 * current entry.
 */
export function useUpgradeDialogUrlState() {
  const [query, setQuery] = useQueryStates(
    {
      ...SETTINGS_PARSERS,
      [UPGRADE_DIALOG_PARAM]: parseAsString,
      [UPGRADE_TAB_PARAM]: parseAsString,
    },
    QUERY_OPTIONS
  );
  const open = query[UPGRADE_DIALOG_PARAM] === UPGRADE_DIALOG_OPEN_VALUE;
  const tab = resolveUpgradeTab(query[UPGRADE_TAB_PARAM]);

  const openUpgrade = useCallback(
    (nextTab?: UpgradeTabId) => {
      // Swapping from another account dialog replaces its entry, so Back
      // does not reopen the dialog that was just replaced.
      const switching = open || parseSettingsDialogQuery(query).open;
      void setQuery(
        {
          ...CLOSED_SETTINGS_QUERY,
          [UPGRADE_DIALOG_PARAM]: UPGRADE_DIALOG_OPEN_VALUE,
          [UPGRADE_TAB_PARAM]: nextTab ?? null,
        },
        { ...QUERY_OPTIONS, history: switching ? 'replace' : 'push' }
      );
    },
    [open, query, setQuery]
  );
  const selectTab = useCallback(
    (next: string) => {
      void setQuery(
        {
          [UPGRADE_DIALOG_PARAM]: UPGRADE_DIALOG_OPEN_VALUE,
          [UPGRADE_TAB_PARAM]: resolveUpgradeTab(next),
        },
        { ...QUERY_OPTIONS, history: 'replace' }
      );
    },
    [setQuery]
  );
  const closeUpgrade = useCallback(() => {
    void setQuery(CLOSED_UPGRADE_DIALOG_QUERY, {
      ...QUERY_OPTIONS,
      history: 'replace',
    });
  }, [setQuery]);

  return { closeUpgrade, open, openUpgrade, selectTab, tab };
}
