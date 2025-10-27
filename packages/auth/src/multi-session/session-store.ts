import type { Session, User } from '@supabase/supabase-js';
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
  SwitchAccountOptions,
} from './types';

const DEFAULT_STORAGE_KEY = 'tuturuuu_multi_session_store';
const DEFAULT_MAX_ACCOUNTS = 5;
const STORE_VERSION = 1;

/**
 * Multi-session store manager
 * Handles storage, encryption, and management of multiple Supabase sessions
 */
export class SessionStore {
  private config: Required<MultiSessionConfig>;
  private listeners: Set<SessionStoreListener> = new Set();
  private encryptionKey: string | null = null;

  constructor(config: MultiSessionConfig = {}) {
    this.config = {
      maxAccounts: config.maxAccounts ?? DEFAULT_MAX_ACCOUNTS,
      storageKey: config.storageKey ?? DEFAULT_STORAGE_KEY,
      autoRefreshInactive: config.autoRefreshInactive ?? true,
      encryptionKey: config.encryptionKey ?? '',
    };
  }

  /**
   * Initialize the store and encryption key
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

      const parsed = JSON.parse(stored) as MultiSessionStore;

      // Validate version and structure
      if (parsed.version !== STORE_VERSION) {
        console.warn('Store version mismatch, resetting store');
        return this.createEmptyStore();
      }

      return parsed;
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
      console.error('Failed to save session store:', error);
      throw new Error('Failed to save session store');
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
    return store.accounts;
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
      )) as Session;

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
    session: Session,
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
        session,
        this.encryptionKey
      );

      // Create account metadata
      const metadata: AccountMetadata = {
        lastWorkspaceId: options.workspaceId,
        lastRoute: undefined,
        lastActiveAt: Date.now(),
        displayName: session.user.user_metadata?.display_name,
        avatarUrl: session.user.user_metadata?.avatar_url,
        email: session.user.email,
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

    // Remove the account
    store.accounts.splice(accountIndex, 1);

    // If this was the active account, switch to another or clear
    if (store.activeAccountId === accountId) {
      store.activeAccountId = store.accounts[0]?.id ?? null;
    }

    this.saveStore(store);
    this.emit({ type: 'account-removed', accountId });

    return {
      success: true,
      accountId,
    };
  }

  /**
   * Switch to a different account
   */
  async switchAccount(
    accountId: string,
    options: SwitchAccountOptions = {}
  ): Promise<AccountOperationResult> {
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
    session: Session
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
      // Re-encrypt the updated session
      account.encryptedSession = await encryptSession(
        session,
        this.encryptionKey
      );

      // Update metadata
      account.metadata = {
        ...account.metadata,
        displayName: session.user.user_metadata?.display_name,
        avatarUrl: session.user.user_metadata?.avatar_url,
        email: session.user.email,
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
    return accounts.sort(
      (a, b) => b.metadata.lastActiveAt - a.metadata.lastActiveAt
    );
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
