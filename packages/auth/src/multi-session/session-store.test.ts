/**
 * Tests for Multi-Session Store
 *
 * Tests the SessionStore class and its helper functions including
 * the LRUCache implementation and account management.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

// Mock window and crypto for browser environment
const setupBrowserMocks = () => {
  // Setup localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });

  // Setup crypto (Node.js webcrypto)
  if (typeof globalThis.crypto === 'undefined') {
    const { webcrypto } = require('crypto');
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto,
      writable: true,
    });
  }

  // Setup navigator (needed for generateEncryptionKey)
  if (typeof globalThis.navigator === 'undefined') {
    (globalThis as any).navigator = {
      userAgent: 'test-user-agent',
      language: 'en-US',
    };
  }

  // Setup screen (needed for generateEncryptionKey)
  if (typeof globalThis.screen === 'undefined') {
    (globalThis as any).screen = {
      colorDepth: 24,
      width: 1920,
      height: 1080,
    };
  }

  // Setup window
  if (typeof globalThis.window === 'undefined') {
    (globalThis as any).window = {
      crypto: globalThis.crypto,
    };
  }
};

// Import after mocks are set up
setupBrowserMocks();

import { createSessionStore, SessionStore } from './session-store';

describe('SessionStore', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    setupBrowserMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with default config', async () => {
      const store = new SessionStore();
      await store.initialize();

      // Store should be initialized
      const stats = store.getStats();
      expect(stats.totalAccounts).toBe(0);
      expect(stats.activeAccountId).toBeNull();
      expect(stats.maxAccounts).toBe(5);
    });

    it('should initialize with custom config', async () => {
      const store = new SessionStore({
        maxAccounts: 10,
        storageKey: 'custom_key',
        encryptionKey: 'my-custom-key',
      });
      await store.initialize();

      const stats = store.getStats();
      expect(stats.maxAccounts).toBe(10);
      expect(stats.storageKey).toBe('custom_key');
    });

    it('should throw when crypto is not available', async () => {
      const originalWindow = globalThis.window;
      (globalThis as any).window = undefined;

      const store = new SessionStore();
      await expect(store.initialize()).rejects.toThrow(
        'Web Crypto API is not available'
      );

      (globalThis as any).window = originalWindow;
    });
  });

  describe('createSessionStore factory', () => {
    it('should create and initialize a store', async () => {
      const store = await createSessionStore();
      const stats = store.getStats();

      expect(stats.totalAccounts).toBe(0);
      expect(stats.activeAccountId).toBeNull();
    });

    it('should accept custom config', async () => {
      const store = await createSessionStore({
        maxAccounts: 3,
        storageKey: 'test_store',
      });
      const stats = store.getStats();

      expect(stats.maxAccounts).toBe(3);
      expect(stats.storageKey).toBe('test_store');
    });
  });

  describe('account operations', () => {
    let store: SessionStore;

    const mockSession = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: {
        id: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {
          display_name: 'Test User',
          avatar_url: 'https://example.com/avatar.jpg',
        },
        created_at: new Date().toISOString(),
      },
    };

    beforeEach(async () => {
      store = new SessionStore({ encryptionKey: 'test-key-12345' });
      await store.initialize();
    });

    it('should add an account successfully', async () => {
      const result = await store.addAccount(mockSession as any);

      expect(result.success).toBe(true);
      expect(result.accountId).toBe('user-123');

      const accounts = await store.getAccounts();
      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.id).toBe('user-123');
    });

    it('should not add duplicate accounts', async () => {
      await store.addAccount(mockSession as any);
      const result = await store.addAccount(mockSession as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Account already exists');

      const accounts = await store.getAccounts();
      expect(accounts).toHaveLength(1);
    });

    it('should respect max accounts limit', async () => {
      const limitedStore = new SessionStore({
        maxAccounts: 2,
        encryptionKey: 'test-key',
      });
      await limitedStore.initialize();

      // Add first account
      await limitedStore.addAccount({
        ...mockSession,
        user: { ...mockSession.user, id: 'user-1' },
      } as any);

      // Add second account
      await limitedStore.addAccount({
        ...mockSession,
        user: { ...mockSession.user, id: 'user-2' },
      } as any);

      // Try to add third account
      const result = await limitedStore.addAccount({
        ...mockSession,
        user: { ...mockSession.user, id: 'user-3' },
      } as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Maximum 2 accounts allowed');
    });

    it('should set first account as active by default', async () => {
      await store.addAccount(mockSession as any);

      const activeId = store.getActiveAccountId();
      expect(activeId).toBe('user-123');
    });

    it('should switch immediate when requested', async () => {
      // Add first account
      await store.addAccount(mockSession as any);

      // Add second account with switchImmediately
      await store.addAccount(
        {
          ...mockSession,
          user: { ...mockSession.user, id: 'user-456' },
        } as any,
        { switchImmediately: true }
      );

      const activeId = store.getActiveAccountId();
      expect(activeId).toBe('user-456');
    });

    it('should remove an account', async () => {
      await store.addAccount(mockSession as any);
      const result = await store.removeAccount('user-123');

      expect(result.success).toBe(true);

      const accounts = await store.getAccounts();
      expect(accounts).toHaveLength(0);
    });

    it('should return error when removing non-existent account', async () => {
      const result = await store.removeAccount('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Account not found');
    });

    it('should switch active account when active one is removed', async () => {
      await store.addAccount(mockSession as any);
      await store.addAccount({
        ...mockSession,
        user: { ...mockSession.user, id: 'user-456' },
      } as any);

      // Active account is user-123
      expect(store.getActiveAccountId()).toBe('user-123');

      // Remove active account
      await store.removeAccount('user-123');

      // Should switch to remaining account
      expect(store.getActiveAccountId()).toBe('user-456');
    });

    it('should switch account successfully', async () => {
      await store.addAccount(mockSession as any);
      await store.addAccount({
        ...mockSession,
        user: { ...mockSession.user, id: 'user-456' },
      } as any);

      const result = await store.switchAccount('user-456');

      expect(result.success).toBe(true);
      expect(store.getActiveAccountId()).toBe('user-456');
    });

    it('should return error when switching to non-existent account', async () => {
      const result = await store.switchAccount('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Account not found');
    });

    it('should get account by ID', async () => {
      await store.addAccount(mockSession as any);
      const account = await store.getAccount('user-123');

      expect(account).not.toBeNull();
      expect(account?.id).toBe('user-123');
    });

    it('should return null for non-existent account', async () => {
      const account = await store.getAccount('non-existent');
      expect(account).toBeNull();
    });
  });

  describe('metadata operations', () => {
    let store: SessionStore;

    const mockSession = {
      access_token: 'test-token',
      refresh_token: 'test-refresh',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: {
        id: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    };

    beforeEach(async () => {
      store = new SessionStore({ encryptionKey: 'test-key-12345' });
      await store.initialize();
      await store.addAccount(mockSession as any);
    });

    it('should update account metadata', async () => {
      const result = await store.updateAccountMetadata('user-123', {
        lastWorkspaceId: 'ws-abc',
        lastRoute: '/dashboard',
      });

      expect(result.success).toBe(true);

      const account = await store.getAccount('user-123');
      expect(account?.metadata.lastWorkspaceId).toBe('ws-abc');
      expect(account?.metadata.lastRoute).toBe('/dashboard');
    });

    it('should return error when updating non-existent account', async () => {
      const result = await store.updateAccountMetadata('non-existent', {
        lastWorkspaceId: 'ws-abc',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Account not found');
    });
  });

  describe('session operations', () => {
    let store: SessionStore;

    const mockSession = {
      access_token: 'test-token',
      refresh_token: 'test-refresh',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: {
        id: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {
          display_name: 'Test User',
        },
        created_at: new Date().toISOString(),
      },
    };

    beforeEach(async () => {
      store = new SessionStore({ encryptionKey: 'test-key-12345' });
      await store.initialize();
      await store.addAccount(mockSession as any);
    });

    it('should get decrypted session for account', async () => {
      const accountSession = await store.getAccountSession('user-123');

      expect(accountSession).not.toBeNull();
      expect(accountSession?.session.access_token).toBe('test-token');
      expect(accountSession?.user.email).toBe('test@example.com');
    });

    it('should return null for non-existent account session', async () => {
      const accountSession = await store.getAccountSession('non-existent');
      expect(accountSession).toBeNull();
    });

    it('should update account session', async () => {
      const updatedSession = {
        ...mockSession,
        access_token: 'new-token',
        user: {
          ...mockSession.user,
          user_metadata: {
            display_name: 'Updated User',
          },
        },
      };

      const result = await store.updateAccountSession(
        'user-123',
        updatedSession as any
      );
      expect(result.success).toBe(true);

      const accountSession = await store.getAccountSession('user-123');
      expect(accountSession?.session.access_token).toBe('new-token');
    });

    it('should check if session is expired', async () => {
      // Session with future expiry
      let isExpired = await store.isSessionExpired('user-123');
      expect(isExpired).toBe(false);

      // Add account with expired session
      const expiredSession = {
        ...mockSession,
        expires_at: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        user: { ...mockSession.user, id: 'expired-user' },
      };
      await store.addAccount(expiredSession as any);

      isExpired = await store.isSessionExpired('expired-user');
      expect(isExpired).toBe(true);
    });

    it('should return true for non-existent account session expiry check', async () => {
      const isExpired = await store.isSessionExpired('non-existent');
      expect(isExpired).toBe(true);
    });
  });

  describe('event listeners', () => {
    let store: SessionStore;

    const mockSession = {
      access_token: 'test-token',
      refresh_token: 'test-refresh',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: {
        id: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    };

    beforeEach(async () => {
      store = new SessionStore({ encryptionKey: 'test-key-12345' });
      await store.initialize();
    });

    it('should emit account-added event', async () => {
      const listener = vi.fn();
      store.on(listener);

      await store.addAccount(mockSession as any);

      expect(listener).toHaveBeenCalledWith({
        type: 'account-added',
        accountId: 'user-123',
      });
    });

    it('should emit account-removed event', async () => {
      await store.addAccount(mockSession as any);

      const listener = vi.fn();
      store.on(listener);

      await store.removeAccount('user-123');

      expect(listener).toHaveBeenCalledWith({
        type: 'account-removed',
        accountId: 'user-123',
      });
    });

    it('should emit account-switched event', async () => {
      await store.addAccount(mockSession as any);
      await store.addAccount({
        ...mockSession,
        user: { ...mockSession.user, id: 'user-456' },
      } as any);

      const listener = vi.fn();
      store.on(listener);

      await store.switchAccount('user-456');

      expect(listener).toHaveBeenCalledWith({
        type: 'account-switched',
        fromId: 'user-123',
        toId: 'user-456',
      });
    });

    it('should allow unsubscribing from events', async () => {
      const listener = vi.fn();
      const unsubscribe = store.on(listener);

      unsubscribe();

      await store.addAccount(mockSession as any);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('clearAll', () => {
    it('should clear all accounts and reset store', async () => {
      const store = new SessionStore({ encryptionKey: 'test-key-12345' });
      await store.initialize();

      await store.addAccount({
        access_token: 'test',
        refresh_token: 'test',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      } as any);

      await store.clearAll();

      const accounts = await store.getAccounts();
      expect(accounts).toHaveLength(0);
      expect(store.getActiveAccountId()).toBeNull();
    });
  });

  describe('getAccountsSortedByActivity', () => {
    it('should return accounts sorted by last active time', async () => {
      const store = new SessionStore({ encryptionKey: 'test-key-12345' });
      await store.initialize();

      // Add accounts
      await store.addAccount({
        access_token: 'test1',
        refresh_token: 'test1',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: {
          id: 'user-1',
          email: 'user1@example.com',
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      } as any);

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await store.addAccount({
        access_token: 'test2',
        refresh_token: 'test2',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: {
          id: 'user-2',
          email: 'user2@example.com',
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      } as any);

      // Switch to first account to update its lastActiveAt
      await new Promise((resolve) => setTimeout(resolve, 10));
      await store.switchAccount('user-1');

      const sorted = await store.getAccountsSortedByActivity();

      // user-1 should be first since it was just accessed
      expect(sorted[0]?.id).toBe('user-1');
      expect(sorted[1]?.id).toBe('user-2');
    });
  });

  describe('exportStore', () => {
    it('should export store with encrypted sessions', async () => {
      const store = new SessionStore({ encryptionKey: 'test-key-12345' });
      await store.initialize();

      await store.addAccount({
        access_token: 'secret-token',
        refresh_token: 'secret-refresh',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      } as any);

      const exported = store.exportStore();

      expect(exported.accounts).toHaveLength(1);
      expect(exported.accounts[0]?.encryptedSession).toBeDefined();
      // Encrypted session should not contain plaintext tokens
      expect(exported.accounts[0]?.encryptedSession).not.toContain(
        'secret-token'
      );
    });
  });

  describe('store validation', () => {
    it('should reset store on invalid data', async () => {
      // Set invalid data in localStorage
      localStorageMock.setItem(
        'tuturuuu_multi_session_store',
        JSON.stringify({ invalid: 'data' })
      );

      const store = new SessionStore({ encryptionKey: 'test-key' });
      await store.initialize();

      const accounts = await store.getAccounts();
      expect(accounts).toHaveLength(0);
    });

    it('should reset store on version mismatch', async () => {
      // Set data with old version
      localStorageMock.setItem(
        'tuturuuu_multi_session_store',
        JSON.stringify({
          accounts: [],
          activeAccountId: null,
          version: 0, // Old version
        })
      );

      const store = new SessionStore({ encryptionKey: 'test-key' });
      await store.initialize();

      const stats = store.getStats();
      expect(stats.totalAccounts).toBe(0);
    });
  });
});
