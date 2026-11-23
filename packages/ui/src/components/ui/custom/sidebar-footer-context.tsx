'use client';

import {
  type ComponentType,
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * Set by the shared sidebar around its footer account row. `expanded` tells the
 * account menu whether to reveal the name and email beside the avatar, so
 * expanding never moves the avatar.
 */
export const SidebarFooterContext = createContext({ expanded: false });

export function useSidebarFooter() {
  return useContext(SidebarFooterContext);
}

export interface AccountHubState {
  /** Unread notifications, shown as a badge on the account avatar. */
  unreadCount: number;
  notifications?: { label: string; unreadText: string };
  notificationsOpen: boolean;
  upgrade?: {
    label: string;
    href: string;
    external: boolean;
    Link?: ComponentType<{
      href: string;
      className?: string;
      children?: ReactNode;
    }>;
  };
  discord?: { href: string };
  feedback?: { label: string; open: () => void };
}

interface AccountHubControls {
  patch: (next: Partial<AccountHubState>) => void;
  /** The avatar button the notifications popover anchors to. */
  anchorRef: RefObject<HTMLElement | null>;
}

// State and controls are separate contexts: publishers depend only on the
// stable controls, so publishing never re-renders the publisher.
const AccountHubStateContext = createContext<AccountHubState | null>(null);
const AccountHubControlsContext = createContext<AccountHubControls | null>(
  null
);

/**
 * The account avatar is the single entry for notifications, Upgrade, Discord
 * and Feedback. The sidebar hosts those controls and publishes their state
 * here; every account menu renders them as items and the avatar shows the
 * unread badge.
 */
export function AccountHubProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountHubState>({
    unreadCount: 0,
    notificationsOpen: false,
  });
  const anchorRef = useRef<HTMLElement | null>(null);
  const controls = useMemo<AccountHubControls>(
    () => ({
      patch: (next) => setState((s) => ({ ...s, ...next })),
      anchorRef,
    }),
    []
  );
  return (
    <AccountHubControlsContext.Provider value={controls}>
      <AccountHubStateContext.Provider value={state}>
        {children}
      </AccountHubStateContext.Provider>
    </AccountHubControlsContext.Provider>
  );
}

/**
 * Returns focus to the account avatar. The avatar that opened the menu may
 * have been replaced when the sidebar swapped between rail and panel, so fall
 * back to the visible one.
 */
export function focusAccountAnchor(anchor: HTMLElement | null) {
  const target = anchor?.isConnected
    ? anchor
    : [
        ...document.querySelectorAll<HTMLElement>(
          '[data-slot="account-trigger"]'
        ),
      ].find((element) => element.offsetParent !== null);
  target?.focus();
}

/** Null outside the shared sidebar, where controls render standalone. */
export function useAccountHub() {
  const state = useContext(AccountHubStateContext);
  const controls = useContext(AccountHubControlsContext);
  return state && controls ? { state, ...controls } : null;
}

/**
 * Publishes one hub entry while mounted. Pass a memoized value; `undefined`
 * clears the entry.
 */
export function usePublishAccountHub<K extends keyof AccountHubState>(
  key: K,
  value: AccountHubState[K]
) {
  const patch = useContext(AccountHubControlsContext)?.patch;
  useEffect(() => {
    if (!patch) return;
    patch({ [key]: value } as Partial<AccountHubState>);
    return () => patch({ [key]: undefined } as Partial<AccountHubState>);
  }, [patch, key, value]);
}
