'use client';

import type {
  AccountOperationResult,
  AddAccountOptions,
  SessionStore,
  SessionStoreEvent,
  StoredAccountWithEmail,
  SwitchAccountOptions,
} from '@tuturuuu/auth';
import { createSessionStore } from '@tuturuuu/auth';
import {
  createClient,
  switchClientSession,
} from '@tuturuuu/supabase/next/client';
import type { SupabaseSession } from '@tuturuuu/supabase/next/user';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  type JSX,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

interface AccountSwitcherContextValue {
  /** All stored accounts with email (decrypted from session) */
  accounts: StoredAccountWithEmail[];
  /** Currently active account ID */
  activeAccountId: string | null;
  /** Whether the store is initialized */
  isInitialized: boolean;
  /** Whether an account operation is in progress */
  isLoading: boolean;
  /** Add a new account */
  addAccount: (
    session: SupabaseSession,
    options?: AddAccountOptions
  ) => Promise<AccountOperationResult>;
  /** Remove an account */
  removeAccount: (accountId: string) => Promise<AccountOperationResult>;
  /** Switch to a different account */
  switchAccount: (
    accountId: string,
    options?: SwitchAccountOptions
  ) => Promise<AccountOperationResult>;
  /** Update current account's workspace context */
  updateWorkspaceContext: (
    workspaceId: string,
    route?: string
  ) => Promise<void>;
  /** Logout current account (switches to another if available) */
  logout: () => Promise<void>;
  /** Logout all accounts */
  logoutAll: () => Promise<void>;
  /** Refresh accounts list */
  refreshAccounts: () => Promise<void>;
}

const AccountSwitcherContext = createContext<
  AccountSwitcherContextValue | undefined
>(undefined);

/**
 * Special routes that should not be saved as workspace context
 */
const SPECIAL_ROUTES = [
  'settings',
  'login',
  'onboarding',
  'add-account',
] as const;

interface AccountSwitcherProviderProps {
  children: ReactNode;
}

export function AccountSwitcherProvider({
  children,
}: AccountSwitcherProviderProps): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const [store, setStore] = useState<SessionStore | null>(null);
  const [accounts, setAccounts] = useState<StoredAccountWithEmail[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const initializingRef = useRef(false);

  // Stable ref for refreshAccounts to prevent infinite loops
  const refreshAccountsRef = useRef<(() => Promise<void>) | null>(null);

  // Refresh accounts list from store (with emails from encrypted sessions)
  const refreshAccounts = useCallback(async () => {
    if (!store) return;
    if (process.env.NODE_ENV === 'development') {
      console.log('[refreshAccounts] Refreshing accounts...');
    }
    const storedAccounts = await store.getAccountsWithEmail();
    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[refreshAccounts] Loaded accounts count:',
        storedAccounts.length
      );
    }
    setAccounts(storedAccounts);

    const activeId = store.getActiveAccountId();
    if (process.env.NODE_ENV === 'development') {
      console.log('[refreshAccounts] Has active account:', !!activeId);
    }
    setActiveAccountId(activeId);
  }, [store]);

  // Keep the ref updated with the latest refreshAccounts function
  useEffect(() => {
    refreshAccountsRef.current = refreshAccounts;
  }, [refreshAccounts]);

  // Initialize the session store
  // Runs only once on mount to prevent infinite loops
  useEffect(() => {
    // Prevent multiple simultaneous initializations
    if (initializingRef.current) return;
    initializingRef.current = true;

    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const initStore = async () => {
      try {
        // Set a timeout to prevent infinite hangs
        timeoutId = setTimeout(() => {
          if (mounted && !isInitialized) {
            console.warn(
              'Session store initialization timeout - marking as initialized'
            );
            setIsInitialized(true);
          }
        }, 5000); // 5 second timeout

        const sessionStore = await createSessionStore();
        if (!mounted) return;

        setStore(sessionStore);

        // Load initial accounts (with emails from encrypted sessions)
        const storedAccounts = await sessionStore.getAccountsWithEmail();
        if (process.env.NODE_ENV === 'development') {
          console.log('Loaded stored accounts count:', storedAccounts.length);
        }
        if (!mounted) return;

        setAccounts(storedAccounts);

        // Get current session to sync with store
        const client = createClient();
        const {
          data: { session: currentSession },
        } = await client.auth.getSession();

        if (process.env.NODE_ENV === 'development') {
          console.log('Current session exists:', !!currentSession);
        }

        // Only auto-add current session if not on login/auth pages
        // Use stricter matching to avoid false positives
        const isAuthPage =
          /\/login(\/|$)/.test(pathname) ||
          /\/add-account(\/|$)/.test(pathname);

        // Sync activeAccountId with current session
        if (currentSession) {
          const currentUserId = currentSession.user.id;
          const storedActiveId = sessionStore.getActiveAccountId();

          if (process.env.NODE_ENV === 'development') {
            console.log('Has stored active account:', !!storedActiveId);
          }

          // Check if current session is in the store
          const currentAccountInStore = storedAccounts.some(
            (acc) => acc.id === currentUserId
          );

          if (process.env.NODE_ENV === 'development') {
            console.log('Current account in store:', currentAccountInStore);
          }

          // If current session is not in store and we're not on an auth page, add it
          if (!currentAccountInStore && !isAuthPage) {
            if (process.env.NODE_ENV === 'development') {
              console.log('Adding current session to store (not on auth page)');
            }
            await sessionStore.addAccount(currentSession, {
              switchImmediately: true,
            });
            // Reload accounts - IMPORTANT: Update both store reference AND state
            const updatedAccounts = await sessionStore.getAccountsWithEmail();
            if (process.env.NODE_ENV === 'development') {
              console.log(
                'After adding, accounts count:',
                updatedAccounts.length
              );
            }
            if (!mounted) return;
            setAccounts(updatedAccounts);
            setActiveAccountId(currentUserId);
          } else {
            // Even if account exists, make sure state is up to date
            // This fixes the issue where accounts don't refresh after adding
            const currentAccounts = await sessionStore.getAccountsWithEmail();
            if (currentAccounts.length !== storedAccounts.length) {
              if (process.env.NODE_ENV === 'development') {
                console.log('Account count changed, refreshing state:', {
                  old: storedAccounts.length,
                  new: currentAccounts.length,
                });
              }
              setAccounts(currentAccounts);
            }

            // If the current session doesn't match the stored active account,
            // update the store to match reality
            if (storedActiveId !== currentUserId) {
              if (process.env.NODE_ENV === 'development') {
                console.log('Syncing active account (mismatch detected)');
              }
              await sessionStore.switchAccount(currentUserId);
            }

            setActiveAccountId(currentUserId);
          }

          if (process.env.NODE_ENV === 'development') {
            console.log('Set active account:', !!currentUserId);
          }
        } else {
          setActiveAccountId(sessionStore.getActiveAccountId());
        }

        if (timeoutId !== undefined) clearTimeout(timeoutId);
        if (!mounted) return;
        setIsInitialized(true);

        // Handle store events (defined inside useEffect to use stable ref)
        const handleStoreEvent = (event: SessionStoreEvent) => {
          if (process.env.NODE_ENV === 'development') {
            console.log(
              '[handleStoreEvent] Session store event type:',
              event.type
            );
          }

          if (
            event.type === 'account-added' ||
            event.type === 'account-removed'
          ) {
            // Refresh accounts list
            if (process.env.NODE_ENV === 'development') {
              console.log(
                '[handleStoreEvent] Refreshing accounts due to:',
                event.type
              );
            }
            refreshAccountsRef.current?.();
          } else if (event.type === 'account-switched') {
            // Update active account
            if (process.env.NODE_ENV === 'development') {
              console.log('[handleStoreEvent] Switching active account');
            }
            setActiveAccountId(event.toId);
          } else if (event.type === 'session-refreshed') {
            if (process.env.NODE_ENV === 'development') {
              console.log('[handleStoreEvent] Session refreshed for account');
            }
            // Optionally refresh accounts to get updated metadata
            refreshAccountsRef.current?.();
          }
        };

        // Listen for store events (in-process)
        const unsubscribe = sessionStore.on(handleStoreEvent);

        // Listen for storage events from other tabs (cross-tab sync)
        const handleStorageChange = (event: StorageEvent) => {
          if (
            event.key?.includes('tuturuuu_multi_session_store') &&
            event.newValue !== event.oldValue
          ) {
            if (process.env.NODE_ENV === 'development') {
              console.log(
                '[storage event] Detected store change from other tab'
              );
            }
            refreshAccountsRef.current?.();
          }
        };

        window.addEventListener('storage', handleStorageChange);

        return () => {
          unsubscribe?.();
          window.removeEventListener('storage', handleStorageChange);
        };
      } catch (error) {
        console.error('Failed to initialize session store:', error);
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        if (mounted) {
          setIsInitialized(true); // Mark as initialized even on error
        }
      }
    };

    const unsubscribePromise = initStore();
    return () => {
      mounted = false;
      initializingRef.current = false;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      unsubscribePromise.then((unsubscribe) => unsubscribe?.());
    };
  }, [isInitialized, pathname]); // Run only once on mount - event handlers use stable refreshAccountsRef

  // Handle account switch navigation
  const handleAccountSwitch = useCallback(
    async (
      accountId: string,
      session: SupabaseSession,
      options?: SwitchAccountOptions
    ) => {
      // Update Supabase client session (sign out + sign in with refresh token)
      const client = createClient();
      const freshSession = await switchClientSession(client, session);

      // If the session was refreshed, update the stored session
      if (
        store &&
        (freshSession.access_token !== session.access_token ||
          freshSession.refresh_token !== session.refresh_token)
      ) {
        await store.updateAccountSession(accountId, freshSession);
      }

      // Determine navigation target
      // Default to '/' which will auto-redirect to root workspace if user is logged in
      // Locale is automatically handled by proxy.ts with 'as-needed' strategy
      let targetPath = '/';

      if (options?.targetRoute) {
        targetPath = options.targetRoute;
      } else if (options?.targetWorkspaceId) {
        targetPath = `/${options.targetWorkspaceId}`;
      } else {
        // Use remembered workspace and route if available
        const account = accounts.find((acc) => acc.id === accountId);
        if (process.env.NODE_ENV === 'development') {
          console.log(
            '[handleAccountSwitch] Account has metadata:',
            !!account?.metadata
          );
        }

        if (account?.metadata.lastRoute) {
          // Use exact last route
          targetPath = account.metadata.lastRoute;
          if (process.env.NODE_ENV === 'development') {
            console.log('[handleAccountSwitch] Using remembered route');
          }
        } else if (account?.metadata.lastWorkspaceId) {
          // Construct workspace URL (locale will be auto-added by proxy if needed)
          targetPath = `/${account.metadata.lastWorkspaceId}`;
          if (process.env.NODE_ENV === 'development') {
            console.log('[handleAccountSwitch] Using remembered workspace');
          }
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.log('[handleAccountSwitch] Using default path');
          }
        }
      }

      // Force a hard refresh to reload all server components
      if (process.env.NODE_ENV === 'development') {
        console.log('[handleAccountSwitch] Redirecting...');
      }
      window.location.href = targetPath;
    },
    [accounts, store]
  );

  // Add a new account
  const addAccount = useCallback(
    async (
      session: SupabaseSession,
      options?: AddAccountOptions
    ): Promise<AccountOperationResult> => {
      if (!store) {
        console.error('[addAccount] Store not initialized');
        return { success: false, error: 'Store not initialized' };
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('[addAccount] Adding account with options:', !!options);
      }

      setIsLoading(true);
      try {
        const result = await store.addAccount(session, options);
        if (process.env.NODE_ENV === 'development') {
          console.log('[addAccount] Store result success:', result.success);
        }

        if (result.success && result.accountId) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[addAccount] Refreshing accounts after add...');
          }
          await refreshAccounts();

          // If switching immediately, handle navigation
          if (options?.switchImmediately) {
            if (process.env.NODE_ENV === 'development') {
              console.log(
                '[addAccount] Switching immediately to new account...'
              );
            }
            const switchOptions: SwitchAccountOptions | undefined =
              options?.workspaceId
                ? { targetWorkspaceId: options.workspaceId }
                : undefined;
            await handleAccountSwitch(result.accountId, session, switchOptions);
          }
        }

        return result;
      } catch (error) {
        console.error('[addAccount] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      } finally {
        setIsLoading(false);
      }
    },
    [store, refreshAccounts, handleAccountSwitch]
  );

  // Forward declare switchAccount for removeAccount
  const switchAccountRef = useRef<
    | ((
        accountId: string,
        options?: SwitchAccountOptions
      ) => Promise<AccountOperationResult>)
    | null
  >(null);

  // Remove an account
  const removeAccount = useCallback(
    async (accountId: string): Promise<AccountOperationResult> => {
      if (!store) {
        return { success: false, error: 'Store not initialized' };
      }

      setIsLoading(true);
      try {
        const result = await store.removeAccount(accountId);

        if (result.success) {
          await refreshAccounts();

          // If we removed the active account, need to switch or logout
          if (activeAccountId === accountId) {
            const remainingAccounts = await store.getAccounts();
            if (remainingAccounts.length > 0 && remainingAccounts[0]) {
              // Switch to first remaining account
              if (switchAccountRef.current) {
                await switchAccountRef.current(remainingAccounts[0].id);
              }
            } else {
              // No accounts left, redirect to login
              router.push('/login');
            }
          }
        }

        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [store, activeAccountId, refreshAccounts, router]
  );

  // Switch to a different account
  const switchAccount = useCallback(
    async (
      accountId: string,
      options?: SwitchAccountOptions
    ): Promise<AccountOperationResult> => {
      if (!store) {
        return { success: false, error: 'Store not initialized' };
      }

      setIsLoading(true);
      try {
        // Get the account session
        const accountSession = await store.getAccountSession(accountId);
        if (!accountSession) {
          return { success: false, error: 'Account session not found' };
        }

        // Update current account's workspace context before switching
        if (activeAccountId) {
          // Extract workspace ID from pathname
          // Expected pattern: /[locale]/[wsId]/... or /[wsId]/...
          // Route groups like (dashboard) don't appear in URLs
          // This regex matches the second path segment, which is typically the workspace ID
          const pathMatch = pathname.match(/^\/[^/]+\/([^/]+)/);
          const workspaceId = pathMatch?.[1];

          // Only proceed if we successfully extracted a workspace ID
          if (workspaceId) {
            // Only save if it's not a special route (settings, login, etc.)
            const isSpecialRoute = SPECIAL_ROUTES.includes(
              workspaceId as (typeof SPECIAL_ROUTES)[number]
            );
            if (!isSpecialRoute) {
              if (process.env.NODE_ENV === 'development') {
                console.log('[switchAccount] Saving workspace context');
              }
              // Verify account still exists before updating metadata
              const account = await store.getAccount(activeAccountId);
              if (account) {
                await store.updateAccountMetadata(activeAccountId, {
                  lastWorkspaceId: workspaceId,
                  lastRoute: pathname,
                });
              }
            }
          }
        }

        // Switch the account in the store
        const result = await store.switchAccount(accountId);

        if (result.success) {
          await handleAccountSwitch(accountId, accountSession.session, options);
        }

        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [store, activeAccountId, pathname, handleAccountSwitch]
  );

  // Update ref after switchAccount is defined
  useEffect(() => {
    switchAccountRef.current = switchAccount;
  }, [switchAccount]);

  // Update workspace context for current account
  const updateWorkspaceContext = useCallback(
    async (workspaceId: string, route?: string) => {
      if (!store || !activeAccountId) return;

      await store.updateAccountMetadata(activeAccountId, {
        lastWorkspaceId: workspaceId,
        lastRoute: route ?? pathname,
      });
    },
    [store, activeAccountId, pathname]
  );

  // Logout current account (switches to another if available)
  const logout = useCallback(async () => {
    if (!store || !activeAccountId) {
      // No active account, just sign out from Supabase
      const client = createClient();
      await client.auth.signOut({ scope: 'local' });
      router.push('/login');
      return;
    }

    setIsLoading(true);
    try {
      if (process.env.NODE_ENV === 'development') {
        console.log('[logout] Logging out current account');
      }

      // Get remaining accounts before removing current one
      const allAccounts = await store.getAccounts();
      const otherAccounts = allAccounts.filter(
        (acc) => acc.id !== activeAccountId
      );

      if (process.env.NODE_ENV === 'development') {
        console.log('[logout] Other accounts available:', otherAccounts.length);
      }

      // Remove current account from store (this will auto-switch if others exist)
      await removeAccount(activeAccountId);

      // If no other accounts, sign out from Supabase and redirect to login
      if (otherAccounts.length === 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[logout] No other accounts, signing out completely');
        }
        const client = createClient();
        await client.auth.signOut({ scope: 'local' });
        router.push('/login');
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.log('[logout] Switched to another account');
        }
        // removeAccount already handles switching to another account
        // Just refresh to ensure UI is updated
        router.refresh();
      }
    } finally {
      setIsLoading(false);
    }
  }, [store, activeAccountId, removeAccount, router]);

  // Logout all accounts
  const logoutAll = useCallback(async () => {
    if (!store) return;

    setIsLoading(true);
    try {
      // Sign out from Supabase (revokes current session)
      const client = createClient();
      await client.auth.signOut();

      // Clear all stored accounts
      await store.clearAll();
      setAccounts([]);
      setActiveAccountId(null);

      // Redirect to login
      router.push('/login');
    } finally {
      setIsLoading(false);
    }
  }, [store, router]);

  const value: AccountSwitcherContextValue = {
    accounts,
    activeAccountId,
    isInitialized,
    isLoading,
    addAccount,
    removeAccount,
    switchAccount,
    updateWorkspaceContext,
    logout,
    logoutAll,
    refreshAccounts,
  };

  return (
    <AccountSwitcherContext.Provider value={value}>
      {children}
    </AccountSwitcherContext.Provider>
  );
}

/**
 * Hook to access the account switcher context
 */
export function useAccountSwitcher(): AccountSwitcherContextValue {
  const context = useContext(AccountSwitcherContext);
  if (!context) {
    throw new Error(
      'useAccountSwitcher must be used within AccountSwitcherProvider'
    );
  }
  return context;
}
