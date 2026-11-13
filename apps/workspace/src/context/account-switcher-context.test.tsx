// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  logoutAll: vi.fn(),
  refresh: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/auth', () => ({
  listWebAccountsWithInternalApi: mocks.list,
  logoutAllWebAccountsWithInternalApi: mocks.logoutAll,
  logoutCurrentWebAccountWithInternalApi: vi.fn(),
  removeWebAccountWithInternalApi: vi.fn(),
  saveCurrentWebAccountWithInternalApi: mocks.save,
  switchWebAccountWithInternalApi: vi.fn(),
  updateCurrentWebAccountWithInternalApi: vi.fn(),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/personal',
  useRouter: () => ({ refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import {
  AccountSwitcherProvider,
  useAccountSwitcher,
} from './account-switcher-context';

const LEGACY_KEY = 'tuturuuu_multi_session_store';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <AccountSwitcherProvider>{children}</AccountSwitcherProvider>
    </QueryClientProvider>
  );
}

describe('AccountSwitcherProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.list.mockResolvedValue({ accounts: [], activeAccountId: null });
    mocks.logoutAll.mockResolvedValue({ success: true });
  });

  it('clears the legacy multi-session store on logoutAll before revoking server sessions', async () => {
    mocks.logoutAll.mockImplementation(async () => {
      expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
      return { success: true };
    });
    const { result } = renderHook(() => useAccountSwitcher(), { wrapper });
    await waitFor(() => expect(result.current.isInitialized).toBe(true));
    // Written after mount: the provider's own migration already ran.
    window.localStorage.setItem(LEGACY_KEY, '{"sessions":[]}');

    await act(async () => {
      await result.current.logoutAll();
    });

    expect(mocks.logoutAll).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('still revokes server sessions when storage access throws', async () => {
    const removeItem = vi
      .spyOn(window.localStorage, 'removeItem')
      .mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
    const { result } = renderHook(() => useAccountSwitcher(), { wrapper });
    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    await act(async () => {
      await result.current.logoutAll();
    });

    expect(removeItem).toHaveBeenCalledWith(LEGACY_KEY);
    expect(mocks.logoutAll).toHaveBeenCalledTimes(1);
    removeItem.mockRestore();
  });

  it('surfaces account_limit from a save so callers can show the limit', async () => {
    mocks.save.mockResolvedValue({
      error: 'limit',
      errorCode: 'account_limit',
      success: false,
    });
    const { result } = renderHook(() => useAccountSwitcher(), { wrapper });
    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    let outcome:
      | Awaited<ReturnType<typeof result.current.addAccount>>
      | undefined;
    await act(async () => {
      outcome = await result.current.addAccount();
    });

    expect(outcome).toMatchObject({
      errorCode: 'account_limit',
      success: false,
    });
  });
});
