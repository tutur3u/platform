'use client';

import { parseAsString, useQueryStates } from 'nuqs';
import { useCallback } from 'react';

export const UPGRADE_DIALOG_PARAM = 'upgradeDialog';
export const UPGRADE_TAB_PARAM = 'upgradeTab';
export const UPGRADE_DIALOG_OPEN_VALUE = 'open';
export const UPGRADE_TAB_IDS = ['plans', 'compare', 'current'] as const;
export type UpgradeTabId = (typeof UPGRADE_TAB_IDS)[number];

const QUERY_OPTIONS = { scroll: false, shallow: true } as const;

/** Returns the tab id, or `plans` for a missing or unknown value. */
export function resolveUpgradeTab(value: string | null | undefined) {
  return UPGRADE_TAB_IDS.find((id) => id === value) ?? 'plans';
}

/**
 * URL-backed open/tab state of the Upgrade dialog (`?upgradeDialog=open&
 * upgradeTab=compare`). Opening pushes a history entry so Back closes the
 * dialog; switching tabs and closing replace the current entry.
 */
export function useUpgradeDialogUrlState() {
  const [query, setQuery] = useQueryStates(
    {
      [UPGRADE_DIALOG_PARAM]: parseAsString,
      [UPGRADE_TAB_PARAM]: parseAsString,
    },
    QUERY_OPTIONS
  );
  const open = query[UPGRADE_DIALOG_PARAM] === UPGRADE_DIALOG_OPEN_VALUE;
  const tab = resolveUpgradeTab(query[UPGRADE_TAB_PARAM]);

  const openUpgrade = useCallback(
    (nextTab?: UpgradeTabId) => {
      void setQuery(
        {
          [UPGRADE_DIALOG_PARAM]: UPGRADE_DIALOG_OPEN_VALUE,
          [UPGRADE_TAB_PARAM]: nextTab ?? null,
        },
        { ...QUERY_OPTIONS, history: open ? 'replace' : 'push' }
      );
    },
    [open, setQuery]
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
    void setQuery(
      { [UPGRADE_DIALOG_PARAM]: null, [UPGRADE_TAB_PARAM]: null },
      { ...QUERY_OPTIONS, history: 'replace' }
    );
  }, [setQuery]);

  return { closeUpgrade, open, openUpgrade, selectTab, tab };
}
