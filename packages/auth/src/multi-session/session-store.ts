import { createHash } from 'node:crypto';
import type { SupabaseSession } from '@tuturuuu/supabase/next/user';
import { z } from 'zod';
import {
  decryptSession,
  encryptSession,
  generateEncryptionKey,
  isCryptoAvailable,
} from './session-crypto';
import type {
  AccountMetadata,
  AccountOperationResult,
  AddAccountOptions,
  DecryptedAccountSession,
  MultiSessionConfig,
  MultiSessionStore,
  SessionStoreEvent,
  SessionStoreListener,
  StoredAccount,
} from './types';

const DEFAULT_STORAGE_KEY = 'tuturuuu_multi_session_store';
const DEFAULT_MAX_ACCOUNTS = 5;
const STORE_VERSION = 1;

/**
 * Compute a deterministic SHA-256 hash of the encrypted session string
 * to use as part of the cache key. This prevents cache collisions between
 * different session strings that happen to have the same length.
 */
function hashEncryptedSession(encryptedSession: string): string {
  return createHash('sha256').update(encryptedSession).digest('hex');
}

/**
 * Simple LRU cache implementation
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }
    // Move to end (most recently used)
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    // Delete if exists (to reinsert at end)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // Add to end
    this.cache.set(key, value);
    // Evict oldest if over size
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Zod schemas for runtime validation
const AccountMetadataSchema = z.object({
  lastWorkspaceId: z.string().optional(),
  lastRoute: z.string().optional(),
  lastActiveAt: z.number(),
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
});

const StoredAccountSchema = z.object({
  id: z.string(),
  encryptedSession: z.string(),
  metadata: AccountMetadataSchema,
  addedAt: z.number(),
});

const MultiSessionStoreSchema = z.object({
  accounts: z.array(StoredAccountSchema),
  activeAccountId: z.string().nullable(),
  version: z.number(),
});

/**
 * Multi-session store manager
 * Handles storage, encryption, and management of multiple Supabase sessions
 */
export class SessionStore {
  private config: Required<MultiSessionConfig>;
  private listeners: Set<SessionStoreListener> = new Set();
  private encryptionKey: string | null = null;
  // LRU cache for decrypted emails (keyed by accountId + SHA-256 hash of encryptedSession)
  private emailCache = new LRUCache<string, string>(100);

  constructor(config: MultiSessionConfig = {}) {
    this.config = {
      maxAccounts: config.maxAccounts ?? DEFAULT_MAX_ACCOUNTS,
      storageKey: config.storageKey ?? DEFAULT_STORAGE_KEY,
      encryptionKey: config.encryptionKey ?? '',
    };
  }

  /**
   * Initialize the store and encryption key
   *
   * SECURITY WARNING: If config.encryptionKey is not provided, a key will be
   * auto-generated and stored in localStorage. This is vulnerable to XSS attacks
   * that can steal the key and decrypt stored sessions offline. For production use,
   * callers SHOULD provide their own encryption key derived from a secure source
   * (e.g., PBKDF2 with user passcode, WebAuthn unwrapping, or server-side key delivery).
   */
  async initialize(): Promise<void> {
    if (!isCryptoAvailable()) {
      throw new Error('Web Crypto API is not available');
    }

    // Generate or retrieve encryption key
    this.encryptionKey =
      this.config.encryptionKey || (await this.getOrCreateEncryptionKey());
  }

  /**
   * Get or create a persistent encryption key
   *
   * SECURITY WARNING: This auto-generated key is stored in localStorage and
   * derived from browser fingerprint properties (userAgent, language, timezone, etc).
   * This approach is NOT cryptographically secure and is vulnerable to:
   * - XSS attacks that can read localStorage and decrypt sessions offline
   * - Fingerprint collision between different devices
   *
   * This is a convenience feature for development/testing. Production applications
   * MUST provide their own encryption key via MultiSessionConfig.encryptionKey.
   *
   * TODO: Track as security debt - consider requiring explicit key or implementing
   * secure key derivation (PBKDF2, WebAuthn, etc.) See GitHub issue #XXXX
   */
  private async getOrCreateEncryptionKey(): Promise<string> {
    const keyStorageKey = `${this.config.storageKey}_encryption_key`;
    let key = localStorage.getItem(keyStorageKey);

    if (!key) {
      key = await generateEncryptionKey();
      localStorage.setItem(keyStorageKey, key);
    }

    return key;
  }

  /**
   * Load the store from storage
   */
  private loadStore(): MultiSessionStore {
    try {
      const stored = localStorage.getItem(this.config.storageKey);
      if (!stored) {
        return this.createEmptyStore();
      }

      const parsed = JSON.parse(stored);

      // Validate with Zod schema
      const validation = MultiSessionStoreSchema.safeParse(parsed);

      if (!validation.success) {
        console.warn(
          'Store validation failed, resetting store:',
          validation.error.issues
        );
        return this.createEmptyStore();
      }

      // Validate version
      if (validation.data.version !== STORE_VERSION) {
        console.warn('Store version mismatch, resetting store');
        return this.createEmptyStore();
      }

      return validation.data;
    } catch (error) {
      console.error('Failed to load session store:', error);
      return this.createEmptyStore();
    }
  }

  /**
   * Save the store to storage
   */
  private saveStore(store: MultiSessionStore): void {
    try {
      localStorage.setItem(this.config.storageKey, JSON.stringify(store));
    } catch (error) {
      throw new Error('Failed to save session store', { cause: error });
    }
  }

  /**
   * Create an empty store
   */
  private createEmptyStore(): MultiSessionStore {
    return {
      accounts: [],
      activeAccountId: null,
      version: STORE_VERSION,
    };
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: SessionStoreEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in session store listener:', error);
      }
    });
  }

  /**
   * Add an event listener
   */
  on(listener: SessionStoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get all stored accounts
   */
  async getAccounts(): Promise<StoredAccount[]> {
    const store = this.loadStore();
    // Return a shallow copy to prevent external mutation of internal state
    return [...store.accounts];
  }

  /**
   * Get the active account ID
   */
  getActiveAccountId(): string | null {
    const store = this.loadStore();
    return store.activeAccountId;
  }

  /**
   * Get a specific account by ID
   */
  async getAccount(accountId: string): Promise<StoredAccount | null> {
    const store = this.loadStore();
    return store.accounts.find((acc) => acc.id === accountId) ?? null;
  }

  /**
   * Get decrypted session for an account
   */
  async getAccountSession(
    accountId: string
  ): Promise<DecryptedAccountSession | null> {
    if (!this.encryptionKey) {
      throw new Error('Store not initialized');
    }

    const account = await this.getAccount(accountId);
    if (!account) return null;

    try {
      const decrypted = (await decryptSession(
        account.encryptedSession,
        this.encryptionKey
      )) as SupabaseSession;

      return {
        session: decrypted,
        user: decrypted.user,
        metadata: account.metadata,
      };
    } catch (error) {
      console.error('Failed to decrypt session:', error);
      this.emit({
        type: 'error',
        error: 'Failed to decrypt session',
      });
      return null;
    }
  }

  /**
   * Add a new account
   */
  async addAccount(
    session: SupabaseSession,
    options: AddAccountOptions = {}
  ): Promise<AccountOperationResult> {
    if (!this.encryptionKey) {
      throw new Error('Store not initialized');
    }

    const store = this.loadStore();
    const userId = session.user.id;

    // Check if account already exists
    if (store.accounts.some((acc) => acc.id === userId)) {
      return {
        success: false,
        error: 'Account already exists',
      };
    }

    // Check account limit
    if (store.accounts.length >= this.config.maxAccounts) {
      return {
        success: false,
        error: `Maximum ${this.config.maxAccounts} accounts allowed`,
      };
    }

    try {
      // Encrypt the session
      const encryptedSession = await encryptSession(
        session as unknown as Record<string, unknown>,
        this.encryptionKey
      );

      // Create account metadata
      const metadata: AccountMetadata = {
        lastWorkspaceId: options.workspaceId,
        lastRoute: undefined,
        lastActiveAt: Date.now(),
        displayName: session.user.user_metadata?.display_name,
        avatarUrl: session.user.user_metadata?.avatar_url,
      };

      // Create stored account
      const storedAccount: StoredAccount = {
        id: userId,
        encryptedSession,
        metadata,
        addedAt: Date.now(),
      };

      // Add to store
      store.accounts.push(storedAccount);

      // Set as active if requested or if it's the first account
      if (options.switchImmediately || store.accounts.length === 1) {
        store.activeAccountId = userId;
      }

      this.saveStore(store);
      this.emit({ type: 'account-added', accountId: userId });

      return {
        success: true,
        accountId: userId,
      };
    } catch (error) {
      console.error('Failed to add account:', error);
      return {
        success: false,
        error: 'Failed to encrypt and store account',
      };
    }
  }

  /**
   * Remove an account
   */
  async removeAccount(accountId: string): Promise<AccountOperationResult> {
    const store = this.loadStore();
    const accountIndex = store.accounts.findIndex(
      (acc) => acc.id === accountId
    );

    if (accountIndex === -1) {
      return {
        success: false,
        error: 'Account not found',
      };
    }

    const account = store.accounts[accountIndex];

    // Remove the account
    store.accounts.splice(accountIndex, 1);

    // If this was the active account, switch to another or clear
    if (store.activeAccountId === accountId) {
      store.activeAccountId = store.accounts[0]?.id ?? null;
    }

    this.saveStore(store);

    // Invalidate email cache for this account
    if (account) {
      const cacheKey = `${account.id}:${hashEncryptedSession(account.encryptedSession)}`;
      this.emailCache.delete(cacheKey);
    }

    this.emit({ type: 'account-removed', accountId });

    return {
      success: true,
      accountId,
    };
  }

  /**
   * Switch to a different account
   */
  async switchAccount(accountId: string): Promise<AccountOperationResult> {
    const store = this.loadStore();
    const account = store.accounts.find((acc) => acc.id === accountId);

    if (!account) {
      return {
        success: false,
        error: 'Account not found',
      };
    }

    const previousAccountId = store.activeAccountId;

    // Update active account
    store.activeAccountId = accountId;

    // Update last active timestamp
    account.metadata.lastActiveAt = Date.now();

    this.saveStore(store);
    this.emit({
      type: 'account-switched',
      fromId: previousAccountId,
      toId: accountId,
    });

    return {
      success: true,
      accountId,
    };
  }

  /**
   * Update account metadata
   */
  async updateAccountMetadata(
    accountId: string,
    metadata: Partial<AccountMetadata>
  ): Promise<AccountOperationResult> {
    const store = this.loadStore();
    const account = store.accounts.find((acc) => acc.id === accountId);

    if (!account) {
      return {
        success: false,
        error: 'Account not found',
      };
    }

    // Merge metadata
    account.metadata = {
      ...account.metadata,
      ...metadata,
      lastActiveAt: Date.now(),
    };

    this.saveStore(store);

    return {
      success: true,
      accountId,
    };
  }

  /**
   * Update session for an account (e.g., after refresh)
   */
  async updateAccountSession(
    accountId: string,
    session: SupabaseSession
  ): Promise<AccountOperationResult> {
    if (!this.encryptionKey) {
      throw new Error('Store not initialized');
    }

    const store = this.loadStore();
    const account = store.accounts.find((acc) => acc.id === accountId);

    if (!account) {
      return {
        success: false,
        error: 'Account not found',
      };
    }

    try {
      // Invalidate old cache entry before updating
      const oldCacheKey = `${account.id}:${hashEncryptedSession(account.encryptedSession)}`;
      this.emailCache.delete(oldCacheKey);

      // Re-encrypt the updated session
      account.encryptedSession = await encryptSession(
        session as unknown as Record<string, unknown>,
        this.encryptionKey
      );

      // Update metadata
      account.metadata = {
        ...account.metadata,
        displayName: session.user.user_metadata?.display_name,
        avatarUrl: session.user.user_metadata?.avatar_url,
      };

      this.saveStore(store);
      this.emit({ type: 'session-refreshed', accountId });

      return {
        success: true,
        accountId,
      };
    } catch (error) {
      console.error('Failed to update account session:', error);
      return {
        success: false,
        error: 'Failed to encrypt updated session',
      };
    }
  }

  /**
   * Clear all accounts (logout all)
   */
  async clearAll(): Promise<void> {
    const store = this.createEmptyStore();
    this.saveStore(store);

    // Clear the encryption key from storage and memory
    const keyStorageKey = `${this.config.storageKey}_encryption_key`;
    localStorage.removeItem(keyStorageKey);
    this.encryptionKey = null;

    // Clear the email cache
    this.emailCache.clear();
  }

  /**
   * Check if an account's session is expired
   */
  async isSessionExpired(accountId: string): Promise<boolean> {
    const accountSession = await this.getAccountSession(accountId);
    if (!accountSession) return true;

    const expiresAt = accountSession.session.expires_at;
    if (!expiresAt) return false;

    // Consider expired if less than 5 minutes remaining
    const expiryTime = expiresAt * 1000;
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    return Date.now() > expiryTime - bufferTime;
  }

  /**
   * Get accounts sorted by last active
   */
  async getAccountsSortedByActivity(): Promise<StoredAccount[]> {
    const accounts = await this.getAccounts();
    return [...accounts].sort(
      (a, b) => b.metadata.lastActiveAt - a.metadata.lastActiveAt
    );
  }

  /**
   * Get accounts with email addresses from decrypted sessions
   * This decrypts each session to extract the email for display purposes
   *
   * Uses an LRU cache to avoid repeated decryption of the same sessions.
   * Cache is invalidated when sessions are updated or deleted.
   *
   * SECURITY NOTE: While emails are encrypted at rest, this method decrypts them for display.
   * XSS attacks that can call this method can still access email addresses.
   * This approach is more secure than storing emails in plaintext metadata.
   */
  async getAccountsWithEmail(): Promise<
    Array<StoredAccount & { email: string }>
  > {
    if (!this.encryptionKey) {
      throw new Error('Store not initialized');
    }

    const accounts = await this.getAccounts();
    const accountsWithEmail = await Promise.all(
      accounts.map(async (account) => {
        // Create cache key from account ID and hash of encrypted session
        // This allows us to detect when the session has changed
        const cacheKey = `${account.id}:${hashEncryptedSession(account.encryptedSession)}`;
        const cachedEmail = this.emailCache.get(cacheKey);

        if (cachedEmail) {
          return {
            ...account,
            email: cachedEmail,
          };
        }

        try {
          const decrypted = (await decryptSession(
            account.encryptedSession,
            this.encryptionKey!
          )) as { user: { email?: string } };

          const email = decrypted.user?.email || 'Unknown';

          // Cache the decrypted email
          this.emailCache.set(cacheKey, email);

          return {
            ...account,
            email,
          };
        } catch (error) {
          console.error('Failed to decrypt session for email:', error);
          return {
            ...account,
            email: 'Unknown',
          };
        }
      })
    );

    return accountsWithEmail;
  }

  /**
   * Export store for debugging (sessions remain encrypted)
   */
  exportStore(): MultiSessionStore {
    return this.loadStore();
  }

  /**
   * Get store statistics
   */
  getStats() {
    const store = this.loadStore();
    return {
      totalAccounts: store.accounts.length,
      activeAccountId: store.activeAccountId,
      maxAccounts: this.config.maxAccounts,
      storageKey: this.config.storageKey,
    };
  }
}

/**
 * Create and initialize a new session store instance
 */
export async function createSessionStore(
  config?: MultiSessionConfig
): Promise<SessionStore> {
  const store = new SessionStore(config);
  await store.initialize();
  return store;
}
