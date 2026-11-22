'use client';

import { parseAsString, useQueryState } from 'nuqs';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

type CallSettingsDialog = {
  open: boolean;
  setOpen: (open: boolean) => void;
  tab: string;
  setTab: (tab: string) => void;
};

type CallSettingsLink = CallSettingsDialog & {
  /** Opens the meeting settings on one tab. */
  show: (tab: string) => void;
};

const Context = createContext<CallSettingsLink | null>(null);

/**
 * Lets a surface elsewhere in the call, such as a refusal message, open the
 * meeting settings on the tab that resolves it.
 */
export function CallSettingsLinkProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('devices');
  // The settings shell restores its tab from this query parameter, so a
  // requested tab is written there as well as to the dialog state.
  const [, setPersistedTab] = useQueryState(
    'settingsTab',
    parseAsString.withOptions({
      history: 'replace',
      shallow: true,
      scroll: false,
    })
  );
  const show = useCallback(
    (next: string) => {
      setTab(next);
      void setPersistedTab(next);
      setOpen(true);
    },
    [setPersistedTab]
  );
  const value = useMemo(
    () => ({ open, setOpen, tab, setTab, show }),
    [open, tab, show]
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Open and tab state of the settings dialog; local when nothing links to it. */
export function useCallSettingsDialog(): CallSettingsDialog {
  const shared = useContext(Context);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('devices');
  return shared ?? { open, setOpen, tab, setTab };
}

/** Opens the meeting settings on a tab, or undefined outside a call. */
export function useOpenCallSettings() {
  return useContext(Context)?.show;
}
