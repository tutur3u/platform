// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountSwitcherProvider,
  useAccountSwitcher,
} from '@/context/account-switcher-context';

const mocks = vi.hoisted(() => ({
  listWebAccountsWithInternalApi: vi.fn(),
  logoutAllWebAccountsWithInternalApi: vi.fn(),
  logoutCurrentWebAccountWithInternalApi: vi.fn(),
  removeWebAccountWithInternalApi: vi.fn(),
  pathname: '/en/personal/tasks' as string,
  routerRefresh: vi.fn(),
  search: 'view=board' as string,
  saveCurrentWebAccountWithInternalApi: vi.fn(),
  switchWebAccountWithInternalApi: vi.fn(),
  toastInfo: vi.fn(),
  updateCurrentWebAccountWithInternalApi: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/auth', () => mocks);

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({
    refresh: mocks.routerRefresh,
  }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    info: mocks.toastInfo,
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AccountSwitcherProvider>{children}</AccountSwitcherProvider>
      </QueryClientProvider>
    );
  };
}

describe('AccountSwitcherProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = '/en/personal/tasks';
    mocks.search = 'view=board';
    window.localStorage.clear();
    mocks.listWebAccountsWithInternalApi.mockResolvedValue({
      accounts: [
        {
          email: 'local@tuturuuu.com',
          id: 'user-1',
          metadata: {
            addedAt: Date.now(),
            avatarUrl: null,
            displayName: 'Local',
            lastActiveAt: Date.now(),
            lastRoute: '/en/personal/tasks',
            lastWorkspaceId: 'personal',
          },
        },
      ],
      activeAccountId: 'user-1',
    });
    mocks.updateCurrentWebAccountWithInternalApi.mockResolvedValue({
      accounts: [],
      activeAccountId: 'user-1',
    });
  });

  it('loads account summaries from the server vault API', async () => {
    const { result } = renderHook(() => useAccountSwitcher(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    expect(result.current.accounts).toHaveLength(1);
    expect(result.current.activeAccountId).toBe('user-1');
    expect(mocks.listWebAccountsWithInternalApi).toHaveBeenCalled();
  });

  it('does not persist auth-only routes as the current account route', async () => {
    mocks.pathname = '/login';
    mocks.search = 'multiAccount=true&returnUrl=%2Fen%2Fpersonal%2Ftasks';

    const { result } = renderHook(() => useAccountSwitcher(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    expect(mocks.updateCurrentWebAccountWithInternalApi).not.toHaveBeenCalled();
  });

  it('clears legacy localStorage sessions and asks users to re-authenticate', async () => {
    window.localStorage.setItem('tuturuuu_multi_session_store', 'old-session');

    renderHook(() => useAccountSwitcher(), {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(window.localStorage.getItem('tuturuuu_multi_session_store')).toBe(
        null
      )
    );

    expect(mocks.toastInfo).toHaveBeenCalledWith(
      'legacy_reauth_required',
      expect.objectContaining({
        description: 'legacy_reauth_required_description',
      })
    );
  });

  it('switches accounts through the internal API helper', async () => {
    mocks.switchWebAccountWithInternalApi.mockResolvedValue({
      accounts: [],
      activeAccountId: 'user-2',
      success: true,
    });
    const { result } = renderHook(() => useAccountSwitcher(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    await result.current.switchAccount('user-2', {
      targetRoute: '/en/personal/calendar',
    });

    expect(mocks.switchWebAccountWithInternalApi).toHaveBeenCalledWith(
      'user-2',
      {
        currentRoute: '/en/personal/tasks?view=board',
        targetRoute: '/en/personal/calendar',
      }
    );
    expect(mocks.routerRefresh).toHaveBeenCalled();
  });

  it('saves add-account completion with the intended return route', async () => {
    mocks.pathname = '/add-account';
    mocks.search = 'returnUrl=%2Fen%2Fpersonal%2Ftasks';
    mocks.saveCurrentWebAccountWithInternalApi.mockResolvedValue({
      accounts: [],
      activeAccountId: 'user-2',
      success: true,
    });

    const { result } = renderHook(() => useAccountSwitcher(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));
    await result.current.addAccount({
      returnUrl: '/en/personal/tasks',
    });

    expect(
      mocks.saveCurrentWebAccountWithInternalApi.mock.calls[0]?.[0]
    ).toEqual({
      returnUrl: '/en/personal/tasks',
      route: '/en/personal/tasks',
    });
    expect(mocks.updateCurrentWebAccountWithInternalApi).not.toHaveBeenCalled();
  });
});
