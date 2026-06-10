'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  SaveCurrentWebAccountPayload,
  WebAccountMutationResponse,
  WebAccountSummary,
} from '@tuturuuu/internal-api/auth';
import {
  listWebAccountsWithInternalApi,
  logoutAllWebAccountsWithInternalApi,
  logoutCurrentWebAccountWithInternalApi,
  removeWebAccountWithInternalApi,
  saveCurrentWebAccountWithInternalApi,
  switchWebAccountWithInternalApi,
  updateCurrentWebAccountWithInternalApi,
} from '@tuturuuu/internal-api/auth';
import { toast } from '@tuturuuu/ui/sonner';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createContext,
  type JSX,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { isPersistableMultiAccountRoutePath } from '@/lib/auth/multi-account/routes';

const ACCOUNTS_QUERY_KEY = ['auth', 'web-accounts'] as const;
const LEGACY_MULTI_SESSION_STORAGE_KEY = 'tuturuuu_multi_session_store';

export interface AccountOperationResult {
  accountId?: string;
  diagnosticCode?: string;
  error?: string;
  redirectTo?: string;
  success: boolean;
}

export interface AddAccountOptions extends SaveCurrentWebAccountPayload {
  switchImmediately?: boolean;
}

export interface SwitchAccountOptions {
  targetRoute?: string;
  targetWorkspaceId?: string;
}

interface AccountSwitcherContextValue {
  accounts: WebAccountSummary[];
  activeAccountId: string | null;
  addAccount: (options?: AddAccountOptions) => Promise<AccountOperationResult>;
  isInitialized: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshAccounts: () => Promise<void>;
  removeAccount: (accountId: string) => Promise<AccountOperationResult>;
  switchAccount: (
    accountId: string,
    options?: SwitchAccountOptions
  ) => Promise<AccountOperationResult>;
  updateWorkspaceContext: (
    workspaceId: string,
    route?: string
  ) => Promise<void>;
}

const AccountSwitcherContext = createContext<
  AccountSwitcherContextValue | undefined
>(undefined);

interface AccountSwitcherProviderProps {
  children: ReactNode;
}

function toAccountOperationResult(
  response: WebAccountMutationResponse
): AccountOperationResult {
  return {
    accountId: response.accountId,
    diagnosticCode: response.diagnosticCode,
    error: response.error,
    redirectTo: response.redirectTo,
    success: response.success,
  };
}

function getRedirectTarget(response: AccountOperationResult) {
  return response.redirectTo && response.redirectTo.trim().length > 0
    ? response.redirectTo
    : null;
}

export function AccountSwitcherProvider({
  children,
}: AccountSwitcherProviderProps): JSX.Element {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('account_switcher');
  const lastSyncedRouteRef = useRef<string | null>(null);

  const currentRoute = useMemo(() => {
    const queryString = searchParams.toString();
    return `${pathname}${queryString ? `?${queryString}` : ''}`;
  }, [pathname, searchParams]);
  const currentPersistableRoute = useMemo(
    () =>
      isPersistableMultiAccountRoutePath(currentRoute) ? currentRoute : null,
    [currentRoute]
  );

  const accountsQuery = useQuery({
    queryFn: () => listWebAccountsWithInternalApi(),
    queryKey: ACCOUNTS_QUERY_KEY,
    retry: 1,
    staleTime: 30_000,
  });

  const invalidateAccounts = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY });
  }, [queryClient]);

  const navigateAfterMutation = useCallback(
    async (response: AccountOperationResult) => {
      await invalidateAccounts();
      const target = getRedirectTarget(response);

      if (target) {
        window.location.assign(target);
        return;
      }

      router.refresh();
    },
    [invalidateAccounts, router]
  );

  const saveCurrentMutation = useMutation({
    mutationFn: (payload?: SaveCurrentWebAccountPayload) =>
      saveCurrentWebAccountWithInternalApi(payload),
    onSuccess: () => invalidateAccounts(),
  });
  const updateCurrentMutation = useMutation({
    mutationFn: (
      payload: Parameters<typeof updateCurrentWebAccountWithInternalApi>[0]
    ) => updateCurrentWebAccountWithInternalApi(payload),
    onSuccess: () => invalidateAccounts(),
  });
  const switchMutation = useMutation({
    mutationFn: ({
      accountId,
      targetRoute,
    }: {
      accountId: string;
      targetRoute?: string;
    }) =>
      switchWebAccountWithInternalApi(accountId, {
        currentRoute,
        targetRoute,
      }),
  });
  const removeMutation = useMutation({
    mutationFn: (accountId: string) =>
      removeWebAccountWithInternalApi(accountId),
  });
  const logoutMutation = useMutation({
    mutationFn: () => logoutCurrentWebAccountWithInternalApi(),
  });
  const logoutAllMutation = useMutation({
    mutationFn: () => logoutAllWebAccountsWithInternalApi(),
  });

  useEffect(() => {
    const legacyValue = window.localStorage.getItem(
      LEGACY_MULTI_SESSION_STORAGE_KEY
    );

    if (!legacyValue) {
      return;
    }

    window.localStorage.removeItem(LEGACY_MULTI_SESSION_STORAGE_KEY);
    toast.info(t('legacy_reauth_required'), {
      description: t('legacy_reauth_required_description'),
    });
  }, [t]);

  useEffect(() => {
    const activeAccountId = accountsQuery.data?.activeAccountId;

    if (
      !activeAccountId ||
      !currentPersistableRoute ||
      lastSyncedRouteRef.current === currentPersistableRoute
    ) {
      return;
    }

    lastSyncedRouteRef.current = currentPersistableRoute;
    updateCurrentMutation.mutate({
      route: currentPersistableRoute,
    });
  }, [
    accountsQuery.data?.activeAccountId,
    currentPersistableRoute,
    updateCurrentMutation,
  ]);

  const addAccount = useCallback(
    async (
      options: AddAccountOptions = {}
    ): Promise<AccountOperationResult> => {
      try {
        const { switchImmediately: shouldNavigate, ...payload } = options;
        const route =
          payload.route ??
          payload.returnUrl ??
          currentPersistableRoute ??
          currentRoute;
        const response = await saveCurrentMutation.mutateAsync({
          ...payload,
          route,
        });
        const result = toAccountOperationResult(response);

        if (shouldNavigate) {
          await navigateAfterMutation(result);
        }

        return result;
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : 'Failed to add account',
          success: false,
        };
      }
    },
    [
      currentPersistableRoute,
      currentRoute,
      navigateAfterMutation,
      saveCurrentMutation,
    ]
  );

  const switchAccount = useCallback(
    async (
      accountId: string,
      options: SwitchAccountOptions = {}
    ): Promise<AccountOperationResult> => {
      const targetRoute =
        options.targetRoute ??
        (options.targetWorkspaceId
          ? `/${options.targetWorkspaceId}`
          : undefined);

      try {
        const response = await switchMutation.mutateAsync({
          accountId,
          targetRoute,
        });
        const result = toAccountOperationResult(response);

        if (result.success) {
          await navigateAfterMutation(result);
        }

        return result;
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : 'Failed to switch account',
          success: false,
        };
      }
    },
    [navigateAfterMutation, switchMutation]
  );

  const removeAccount = useCallback(
    async (accountId: string): Promise<AccountOperationResult> => {
      try {
        const response = await removeMutation.mutateAsync(accountId);
        const result = toAccountOperationResult(response);

        if (result.success) {
          await navigateAfterMutation(result);
        }

        return result;
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : 'Failed to remove account',
          success: false,
        };
      }
    },
    [navigateAfterMutation, removeMutation]
  );

  const updateWorkspaceContext = useCallback(
    async (workspaceId: string, route?: string) => {
      await updateCurrentMutation.mutateAsync({
        route: route ?? currentRoute,
        workspaceId,
      });
    },
    [currentRoute, updateCurrentMutation]
  );

  const logout = useCallback(async () => {
    const response = await logoutMutation.mutateAsync();
    await navigateAfterMutation(toAccountOperationResult(response));
  }, [logoutMutation, navigateAfterMutation]);

  const logoutAll = useCallback(async () => {
    const response = await logoutAllMutation.mutateAsync();
    await navigateAfterMutation(toAccountOperationResult(response));
  }, [logoutAllMutation, navigateAfterMutation]);

  const refreshAccounts = useCallback(async () => {
    await invalidateAccounts();
  }, [invalidateAccounts]);

  const value: AccountSwitcherContextValue = {
    accounts: accountsQuery.data?.accounts ?? [],
    activeAccountId: accountsQuery.data?.activeAccountId ?? null,
    addAccount,
    isInitialized: !accountsQuery.isLoading,
    isLoading:
      accountsQuery.isLoading ||
      saveCurrentMutation.isPending ||
      updateCurrentMutation.isPending ||
      switchMutation.isPending ||
      removeMutation.isPending ||
      logoutMutation.isPending ||
      logoutAllMutation.isPending,
    logout,
    logoutAll,
    refreshAccounts,
    removeAccount,
    switchAccount,
    updateWorkspaceContext,
  };

  return (
    <AccountSwitcherContext.Provider value={value}>
      {children}
    </AccountSwitcherContext.Provider>
  );
}

export function useAccountSwitcher(): AccountSwitcherContextValue {
  const context = useContext(AccountSwitcherContext);

  if (!context) {
    throw new Error(
      'useAccountSwitcher must be used within AccountSwitcherProvider'
    );
  }

  return context;
}
