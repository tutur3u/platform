'use client';

import { parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useMemo } from 'react';
import {
  CLOSED_SETTINGS_DIALOG_QUERY,
  getSettingsDialogHistoryMode,
  parseSettingsDialogQuery,
  serializeSettingsDialogQuery,
} from './settings-dialog-url';

type ExtraValues<K extends string> = Partial<Record<K, string | null>>;

const QUERY_OPTIONS = { scroll: false, shallow: true } as const;

/**
 * URL-backed open/tab state for a settings dialog host. `extraKeys` lists
 * host-specific params (e.g. `settingsBoardId`) that are written on open and
 * cleared on close.
 */
export function useSettingsDialogUrlState<K extends string = never>(
  extraKeys: readonly K[] = []
) {
  // Keyed by a signature so callers may pass inline arrays.
  const extraKeysSignature = extraKeys.join('|');
  const clearedExtras = useMemo(
    () =>
      Object.fromEntries(
        extraKeysSignature
          ? extraKeysSignature.split('|').map((key) => [key, null])
          : []
      ) as Record<K, null>,
    [extraKeysSignature]
  );
  const keyMap = useMemo(() => {
    const parsers: Record<string, typeof parseAsString> = {
      settingsDialog: parseAsString,
      settingsTab: parseAsString,
    };
    for (const key of Object.keys(clearedExtras)) parsers[key] = parseAsString;
    return parsers;
  }, [clearedExtras]);
  const [query, setQuery] = useQueryStates(keyMap, QUERY_OPTIONS);
  const { open, tab } = parseSettingsDialogQuery(query);

  const openSettings = useCallback(
    (nextTab?: string | null, extras?: ExtraValues<K>) => {
      void setQuery(
        {
          ...clearedExtras,
          ...extras,
          ...serializeSettingsDialogQuery(nextTab),
        },
        {
          ...QUERY_OPTIONS,
          history: getSettingsDialogHistoryMode('open', open),
        }
      );
    },
    [clearedExtras, open, setQuery]
  );

  const closeSettings = useCallback(() => {
    void setQuery(
      { ...clearedExtras, ...CLOSED_SETTINGS_DIALOG_QUERY },
      { ...QUERY_OPTIONS, history: getSettingsDialogHistoryMode('close', open) }
    );
  }, [clearedExtras, open, setQuery]);

  const extras = useMemo(() => {
    const values = {} as Record<K, string | null>;
    for (const key of Object.keys(clearedExtras) as K[]) {
      const value = (query as Record<string, string | null | undefined>)[key];
      values[key] = value ?? null;
    }
    return values;
  }, [clearedExtras, query]);

  return { closeSettings, extras, open, openSettings, tab };
}
