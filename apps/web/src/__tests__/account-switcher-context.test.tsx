import {
  AccountSwitcherProvider,
  useAccountSwitcher,
} from '@/context/account-switcher-context';
import { renderHook, waitFor } from '@testing-library/react';
import type { SupabaseSession } from '@tuturuuu/supabase/next/user';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock functions - Use vi.hoisted() to ensure they're available in vi.mock factories
const { mockGetSession, mockSetSession, mockSignOut, mockSwitchClientSession } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockSetSession: vi.fn(),
    mockSignOut: vi.fn(),
    mockSwitchClientSession: vi.fn(),
  }));

// Mock session data
const mockSession: SupabaseSession = {
  user: {
    id: 'user-1',
    email: 'user1@test.com',
    user_metadata: {
      full_name: 'Test User 1',
      avatar_url: 'https://avatar.test/1.jpg',
    },
    app_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  },
  access_token: 'test-access-token-1',
  refresh_token: 'test-refresh-token-1',
  expires_in: 3600,
  expires_at: Date.now() / 1000 + 3600,
  token_type: 'bearer',
};

const mockSession2: SupabaseSession = {
  ...mockSession,
  user: {
    ...mockSession.user,
    id: 'user-2',
    email: 'user2@test.com',
    user_metadata: {
      full_name: 'Test User 2',
      avatar_url: 'https://avatar.test/2.jpg',
    },
  },
  access_token: 'test-access-token-2',
  refresh_token: 'test-refresh-token-2',
};

// Event handler for the mock store
let eventHandler: ((event: any) => void) | null = null;

// Mock the SessionStore from @tuturuuu/auth
const mockSessionStore = {
  initialize: vi.fn().mockResolvedValue(undefined),
  getAccounts: vi.fn().mockResolvedValue([]),
  getAccountsWithEmail: vi.fn().mockResolvedValue([]),
  getAccount: vi.fn().mockResolvedValue(null),
  getAccountSession: vi.fn().mockResolvedValue(null),
  addAccount: vi.fn().mockImplementation(async () => {
    if (eventHandler) {
      eventHandler({ type: 'account-added' });
    }
    return { success: true };
  }),
  removeAccount: vi.fn().mockImplementation(async () => {
    if (eventHandler) {
      eventHandler({ type: 'account-removed' });
    }
    return { success: true };
  }),
  switchAccount: vi.fn().mockImplementation(async (accountId: string) => {
    if (eventHandler) {
      eventHandler({ type: 'account-switched', toId: accountId });
    }
    return { success: true };
  }),
  getActiveAccountId: vi.fn().mockReturnValue(null),
  setActiveAccountId: vi.fn().mockResolvedValue(undefined),
  updateAccountMetadata: vi.fn().mockResolvedValue({ success: true }),
  updateAccountSession: vi.fn().mockResolvedValue({ success: true }),
  clear: vi.fn().mockResolvedValue(undefined),
  clearAll: vi.fn().mockResolvedValue(undefined),
  on: vi.fn().mockImplementation((handler: (event: any) => void) => {
    eventHandler = handler;
    return () => {
      eventHandler = null;
    };
  }),
};

vi.mock('@tuturuuu/auth', () => ({
  createSessionStore: vi.fn(() => mockSessionStore),
}));

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/test-workspace',
}));

// Mock window.location for navigation tests
delete (window as any).location;
(window as any).location = { href: '' };

// Mock Supabase client
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
      setSession: mockSetSession,
      signOut: mockSignOut,
    },
  }),
  switchClientSession: mockSwitchClientSession,
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <AccountSwitcherProvider>{children}</AccountSwitcherProvider>
);

describe('AccountSwitcherContext', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();
    eventHandler = null;

    // Reset SessionStore mocks to default
    mockSessionStore.initialize.mockResolvedValue(undefined);
    mockSessionStore.getAccounts.mockResolvedValue([]);
    mockSessionStore.getAccountsWithEmail.mockResolvedValue([]);
    mockSessionStore.getAccount.mockResolvedValue(null);
    mockSessionStore.getAccountSession.mockResolvedValue(null);

    // Restore event-firing implementations
    mockSessionStore.addAccount.mockImplementation(async () => {
      if (eventHandler) {
        eventHandler({ type: 'account-added' });
      }
      return { success: true, accountId: 'user-1' };
    });

    mockSessionStore.removeAccount.mockImplementation(async () => {
      if (eventHandler) {
        eventHandler({ type: 'account-removed' });
      }
      return { success: true };
    });

    mockSessionStore.switchAccount.mockImplementation(
      async (accountId: string) => {
        if (eventHandler) {
          eventHandler({ type: 'account-switched', toId: accountId });
        }
        return { success: true };
      }
    );

    mockSessionStore.on.mockImplementation((handler: (event: any) => void) => {
      eventHandler = handler;
      return () => {
        eventHandler = null;
      };
    });

    mockSessionStore.getActiveAccountId.mockReturnValue(null);
    mockSessionStore.setActiveAccountId.mockResolvedValue(undefined);
    mockSessionStore.updateAccountMetadata.mockResolvedValue({ success: true });
    mockSessionStore.updateAccountSession.mockResolvedValue({ success: true });
    mockSessionStore.clear.mockResolvedValue(undefined);
    mockSessionStore.clearAll.mockResolvedValue(undefined);

    // Set up default Supabase mock behaviors
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockSetSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    mockSignOut.mockResolvedValue({ error: null });
    mockSwitchClientSession.mockResolvedValue(mockSession);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Initialization', () => {
    it('should initialize with empty accounts', async () => {
      const { result } = renderHook(() => useAccountSwitcher(), { wrapper });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(result.current.accounts).toEqual([]);
      expect(result.current.activeAccountId).toBeNull();
    });

    it('should initialize and detect existing accounts in localStorage', async () => {
      // Mock SessionStore to return existing accounts
      const mockAccountWithEmail = {
        id: 'user-1',
        encryptedSession: 'encrypted-session-1',
        email: 'user1@test.com',
        addedAt: Date.now(),
        metadata: {
          displayName: 'Test User 1',
          avatarUrl: 'https://avatar.test/1.jpg',
          lastActiveAt: Date.now(),
        },
      };

      mockSessionStore.getAccountsWithEmail.mockResolvedValue([
        mockAccountWithEmail,
      ]);
      mockSessionStore.getActiveAccountId.mockReturnValue('user-1');

      const { result } = renderHook(() => useAccountSwitcher(), { wrapper });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(result.current.accounts.length).toBeGreaterThan(0);
      expect(result.current.activeAccountId).toBe('user-1');
    });
  });

  describe('Adding Accounts', () => {
    it('should add a new account successfully', async () => {
      const { result } = renderHook(() => useAccountSwitcher(), { wrapper });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Mock the store to return the new account after adding
      const mockAccountWithEmail = {
        id: 'user-1',
        encryptedSession: 'encrypted-session-1',
        email: 'user1@test.com',
        addedAt: Date.now(),
        metadata: {
          displayName: 'Test User 1',
          avatarUrl: 'https://avatar.test/1.jpg',
          lastActiveAt: Date.now(),
        },
      };

      mockSessionStore.addAccount.mockResolvedValue({
        success: true,
        accountId: 'user-1',
      });
      mockSessionStore.getAccountsWithEmail.mockResolvedValue([
        mockAccountWithEmail,
      ]);

      const addResult = await result.current.addAccount(mockSession, {
        switchImmediately: false,
      });

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(1);
      });

      expect(addResult.success).toBe(true);
      expect(result.current.accounts[0]?.id).toBe('user-1');
    });

    it('should prevent adding duplicate accounts', async () => {
      const { result } = renderHook(() => useAccountSwitcher(), { wrapper });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const mockAccountWithEmail = {
        id: 'user-1',
        encryptedSession: 'encrypted-session-1',
        email: 'user1@test.com',
        addedAt: Date.now(),
        metadata: {
          displayName: 'Test User 1',
          avatarUrl: 'https://avatar.test/1.jpg',
          lastActiveAt: Date.now(),
        },
      };

      // First addition succeeds
      mockSessionStore.addAccount.mockResolvedValueOnce({
        success: true,
        accountId: 'user-1',
      });
      mockSessionStore.getAccountsWithEmail.mockResolvedValue([
        mockAccountWithEmail,
      ]);

      await result.current.addAccount(mockSession, {
        switchImmediately: false,
      });

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(1);
      });

      // Second addition fails (duplicate)
      mockSessionStore.addAccount.mockResolvedValueOnce({
        success: false,
        error: 'Account already exists',
      });

      const duplicateResult = await result.current.addAccount(mockSession, {
        switchImmediately: false,
      });

      expect(duplicateResult.success).toBe(false);
      expect(duplicateResult.error).toContain('already exists');
      expect(result.current.accounts).toHaveLength(1);
    });

    it('should switch to account immediately when switchImmediately is true', async () => {
      const { result } = renderHook(() => useAccountSwitcher(), { wrapper });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const mockAccountWithEmail = {
        id: 'user-1',
        encryptedSession: 'encrypted-session-1',
        email: 'user1@test.com',
        addedAt: Date.now(),
        metadata: {
          displayName: 'Test User 1',
          avatarUrl: 'https://avatar.test/1.jpg',
          lastActiveAt: Date.now(),
        },
      };

      mockSessionStore.addAccount.mockResolvedValue({
        success: true,
        accountId: 'user-1',
      });
      mockSessionStore.getAccountsWithEmail.mockResolvedValue([
        mockAccountWithEmail,
      ]);
      mockSessionStore.getActiveAccountId.mockReturnValue('user-1');

      await result.current.addAccount(mockSession, {
        switchImmediately: true,
      });

      await waitFor(() => {
        expect(result.current.activeAccountId).toBe('user-1');
      });
    });
  });

  describe('Removing Accounts', () => {
    it('should remove an account successfully', async () => {
      const { result } = renderHook(() => useAccountSwitcher(), { wrapper });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const mockAccountWithEmail = {
        id: 'user-1',
        encryptedSession: 'encrypted-session-1',
        email: 'user1@test.com',
        addedAt: Date.now(),
        metadata: {
          displayName: 'Test User 1',
          avatarUrl: 'https://avatar.test/1.jpg',
          lastActiveAt: Date.now(),
        },
      };

      // Add account first
      mockSessionStore.addAccount.mockResolvedValue({
        success: true,
        accountId: 'user-1',
      });
      mockSessionStore.getAccountsWithEmail.mockResolvedValue([
        mockAccountWithEmail,
      ]);

      await result.current.addAccount(mockSession, {
        switchImmediately: false,
      });

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(1);
      });

      // Remove account
      mockSessionStore.removeAccount.mockResolvedValue({ success: true });
      mockSessionStore.getAccountsWithEmail.mockResolvedValue([]);
      mockSessionStore.getActiveAccountId.mockReturnValue(null);

      const removeResult = await result.current.removeAccount('user-1');

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(0);
      });

      expect(removeResult.success).toBe(true);
    });

    it('should switch to another account when removing active account', async () => {
      const { result } = renderHook(() => useAccountSwitcher(), { wrapper });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const mockAccount1 = {
        id: 'user-1',
        encryptedSession: 'encrypted-session-1',
        email: 'user1@test.com',
        addedAt: Date.now(),
        metadata: {
          displayName: 'Test User 1',
          avatarUrl: 'https://avatar.test/1.jpg',
          lastActiveAt: Date.now(),
        },
      };

      const mockAccount2 = {
        id: 'user-2',
        encryptedSession: 'encrypted-session-2',
        email: 'user2@test.com',
        addedAt: Date.now(),
        metadata: {
          displayName: 'Test User 2',
          avatarUrl: 'https://avatar.test/2.jpg',
          lastActiveAt: Date.now(),
        },
      };

      // Add two accounts
      mockSessionStore.addAccount
        .mockResolvedValueOnce({ success: true, accountId: 'user-1' })
        .mockResolvedValueOnce({ success: true, accountId: 'user-2' });
      mockSessionStore.getAccountsWithEmail.mockResolvedValue([
        mockAccount1,
        mockAccount2,
      ]);
      mockSessionStore.getActiveAccountId.mockReturnValue('user-1');

      await result.current.addAccount(mockSession, {
        switchImmediately: true,
      });

      await result.current.addAccount(mockSession2, {
        switchImmediately: false,
      });

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(2);
      });

      // Remove active account
      mockSessionStore.removeAccount.mockResolvedValue({ success: true });
      mockSessionStore.getAccounts.mockResolvedValue([mockAccount2]);
      mockSessionStore.getAccountsWithEmail.mockResolvedValue([mockAccount2]);
      mockSessionStore.getAccountSession.mockResolvedValue({
        session: mockSession2,
      });
      mockSessionStore.getActiveAccountId.mockReturnValue('user-2');

      await result.current.removeAccount('user-1');

      await waitFor(() => {
        // Should auto-switch to the remaining account
        expect(result.current.activeAccountId).toBe('user-2');
      });
    });
  });

  describe('Switching Accounts', () => {
    it('should switch between accounts', async () => {
      const { result } = renderHook(() => useAccountSwitcher(), { wrapper });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const mockAccount1 = {
        id: 'user-1',
        encryptedSession: 'encrypted-session-1',
        email: 'user1@test.com',
        addedAt: Date.now(),
        metadata: {
          displayName: 'Test User 1',
          avatarUrl: 'https://avatar.test/1.jpg',
          lastActiveAt: Date.now(),
        },
      };

      const mockAccount2 = {
        id: 'user-2',
        encryptedSession: 'encrypted-session-2',
        email: 'user2@test.com',
        addedAt: Date.now(),
        metadata: {
          displayName: 'Test User 2',
          avatarUrl: 'https://avatar.test/2.jpg',
          lastActiveAt: Date.now(),
        },
      };

      // Add two accounts
      mockSessionStore.addAccount
        .mockResolvedValueOnce({ success: true, accountId: 'user-1' })
        .mockResolvedValueOnce({ success: true, accountId: 'user-2' });
      mockSessionStore.getAccountsWithEmail.mockResolvedValue([
        mockAccount1,
        mockAccount2,
      ]);
      mockSessionStore.getActiveAccountId.mockReturnValue('user-1');

      await result.current.addAccount(mockSession, {
        switchImmediately: true,
      });

      await result.current.addAccount(mockSession2, {
        switchImmediately: false,
      });

      await waitFor(() => {
        expect(result.current.activeAccountId).toBe('user-1');
      });

      // Switch to second account
      mockSessionStore.getAccountSession.mockResolvedValue({
        session: mockSession2,
      });
      mockSessionStore.getActiveAccountId.mockReturnValue('user-2');

      await result.current.switchAccount('user-2');

      await waitFor(() => {
        expect(result.current.activeAccountId).toBe('user-2');
      });
    });

    it('should not switch to non-existent account', async () => {
      const { result } = renderHook(() => useAccountSwitcher(), { wrapper });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const mockAccountWithEmail = {
        id: 'user-1',
        encryptedSession: 'encrypted-session-1',
        email: 'user1@test.com',
        addedAt: Date.now(),
        metadata: {
          displayName: 'Test User 1',
          avatarUrl: 'https://avatar.test/1.jpg',
          lastActiveAt: Date.now(),
        },
      };

      mockSessionStore.addAccount.mockResolvedValue({
        success: true,
        accountId: 'user-1',
      });
      mockSessionStore.getAccountsWithEmail.mockResolvedValue([
        mockAccountWithEmail,
      ]);
      mockSessionStore.getActiveAccountId.mockReturnValue('user-1');

      await result.current.addAccount(mockSession, {
        switchImmediately: true,
      });

      await waitFor(() => {
        expect(result.current.activeAccountId).toBe('user-1');
      });

      mockSessionStore.switchAccount.mockResolvedValue({
        success: false,
        error: 'Account not found',
      });

      const switchResult =
        await result.current.switchAccount('non-existent-id');

      expect(switchResult.success).toBe(false);
      expect(result.current.activeAccountId).toBe('user-1');
    });
  });

  describe('Logout Functionality', () => {
    it('should logout and switch to another account when multiple accounts exist', async () => {
      const { result } = renderHook(() => useAccountSwitcher(), { wrapper });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const mockAccount1 = {
        id: 'user-1',
        encryptedSession: 'encrypted-session-1',
        email: 'user1@test.com',
        addedAt: Date.now(),
        metadata: {
          displayName: 'Test User 1',
          avatarUrl: 'https://avatar.test/1.jpg',
          lastActiveAt: Date.now(),
        },
      };

      const mockAccount2 = {
        id: 'user-2',
        encryptedSession: 'encrypted-session-2',
        email: 'user2@test.com',
        addedAt: Date.now(),
        metadata: {
          displayName: 'Test User 2',
          avatarUrl: 'https://avatar.test/2.jpg',
          lastActiveAt: Date.now(),
        },
      };

      // Add two accounts
      mockSessionStore.addAccount
        .mockResolvedValueOnce({ success: true, accountId: 'user-1' })
        .mockResolvedValueOnce({ success: true, accountId: 'user-2' });
      mockSessionStore.getAccountsWithEmail.mockResolvedValue([
        mockAccount1,
        mockAccount2,
      ]);
      mockSessionStore.getActiveAccountId.mockReturnValue('user-1');

      await result.current.addAccount(mockSession, {
        switchImmediately: true,
      });

      await result.current.addAccount(mockSession2, {
        switchImmediately: false,
      });

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(2);
      });

      // Logout current account (removes user-1, switches to user-2)
      mockSessionStore.getAccounts.mockResolvedValue([mockAccount2]);
      mockSessionStore.removeAccount.mockResolvedValue({ success: true });
      mockSessionStore.getAccountsWithEmail.mockResolvedValue([mockAccount2]);
      mockSessionStore.getAccountSession.mockResolvedValue({
        session: mockSession2,
      });
      mockSessionStore.getActiveAccountId.mockReturnValue('user-2');

      await result.current.logout();

      await waitFor(() => {
        // Should have one account left and switched to it
        expect(result.current.accounts).toHaveLength(1);
        expect(result.current.activeAccountId).toBe('user-2');
      });
    });

    it('should clear all accounts with logoutAll', async () => {
      const { result } = renderHook(() => useAccountSwitcher(), { wrapper });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const mockAccount1 = {
        id: 'user-1',
        encryptedSession: 'encrypted-session-1',
        email: 'user1@test.com',
        addedAt: Date.now(),
        metadata: {
          displayName: 'Test User 1',
          avatarUrl: 'https://avatar.test/1.jpg',
          lastActiveAt: Date.now(),
        },
      };

      const mockAccount2 = {
        id: 'user-2',
        encryptedSession: 'encrypted-session-2',
        email: 'user2@test.com',
        addedAt: Date.now(),
        metadata: {
          displayName: 'Test User 2',
          avatarUrl: 'https://avatar.test/2.jpg',
          lastActiveAt: Date.now(),
        },
      };

      // Add accounts
      mockSessionStore.addAccount
        .mockResolvedValueOnce({ success: true, accountId: 'user-1' })
        .mockResolvedValueOnce({ success: true, accountId: 'user-2' });
      mockSessionStore.getAccountsWithEmail.mockResolvedValue([
        mockAccount1,
        mockAccount2,
      ]);

      await result.current.addAccount(mockSession, {
        switchImmediately: false,
      });
      await result.current.addAccount(mockSession2, {
        switchImmediately: false,
      });

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(2);
      });

      // Logout all
      mockSessionStore.clear.mockResolvedValue(undefined);
      mockSessionStore.getAccountsWithEmail.mockResolvedValue([]);
      mockSessionStore.getActiveAccountId.mockReturnValue(null);

      await result.current.logoutAll();

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(0);
        expect(result.current.activeAccountId).toBeNull();
      });
    });
  });

  describe('Workspace Context', () => {
    it('should update workspace context for active account', async () => {
      const { result } = renderHook(() => useAccountSwitcher(), { wrapper });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const mockAccountWithEmail = {
        id: 'user-1',
        encryptedSession: 'encrypted-session-1',
        email: 'user1@test.com',
        addedAt: Date.now(),
        metadata: {
          displayName: 'Test User 1',
          avatarUrl: 'https://avatar.test/1.jpg',
          lastActiveAt: Date.now(),
        },
      };

      mockSessionStore.addAccount.mockResolvedValue({
        success: true,
        accountId: 'user-1',
      });
      mockSessionStore.getAccountsWithEmail.mockResolvedValue([
        mockAccountWithEmail,
      ]);
      mockSessionStore.getActiveAccountId.mockReturnValue('user-1');

      await result.current.addAccount(mockSession, {
        switchImmediately: true,
      });

      await waitFor(() => {
        expect(result.current.activeAccountId).toBe('user-1');
      });

      // Update workspace context - mock updated account
      const updatedMockAccount = {
        ...mockAccountWithEmail,
        metadata: {
          ...mockAccountWithEmail.metadata,
          lastWorkspaceId: 'workspace-123',
          lastRoute: '/workspace-123/dashboard',
        },
      };

      mockSessionStore.updateAccountMetadata.mockResolvedValue({
        success: true,
      });
      mockSessionStore.getAccountsWithEmail.mockResolvedValue([
        updatedMockAccount,
      ]);

      await result.current.updateWorkspaceContext(
        'workspace-123',
        '/workspace-123/dashboard'
      );

      // Refresh accounts to get updated metadata
      await result.current.refreshAccounts();

      await waitFor(() => {
        // Check that metadata was updated
        const account = result.current.accounts.find(
          (acc) => acc.id === 'user-1'
        );
        expect(account?.metadata.lastWorkspaceId).toBe('workspace-123');
        expect(account?.metadata.lastRoute).toBe('/workspace-123/dashboard');
      });
    });
  });

  describe('Account Refresh', () => {
    it('should refresh accounts list', async () => {
      const { result } = renderHook(() => useAccountSwitcher(), { wrapper });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const mockAccountWithEmail = {
        id: 'user-1',
        encryptedSession: 'encrypted-session-1',
        email: 'user1@test.com',
        addedAt: Date.now(),
        metadata: {
          displayName: 'Test User 1',
          avatarUrl: 'https://avatar.test/1.jpg',
          lastActiveAt: Date.now(),
        },
      };

      mockSessionStore.addAccount.mockResolvedValue({
        success: true,
        accountId: 'user-1',
      });
      mockSessionStore.getAccountsWithEmail.mockResolvedValue([
        mockAccountWithEmail,
      ]);

      await result.current.addAccount(mockSession, {
        switchImmediately: false,
      });

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(1);
      });

      const initialCount = result.current.accounts.length;

      // Refresh should fetch accounts again
      await result.current.refreshAccounts();

      await waitFor(() => {
        expect(result.current.accounts).toHaveLength(initialCount);
      });
    });
  });
});
