import type { Session, User } from '@supabase/supabase-js';

/**
 * Metadata for a stored account including workspace and route context
 *
 * SECURITY NOTE: This metadata is stored in localStorage alongside encrypted sessions.
 * Minimize PII exposure - email has been removed to reduce data leakage in case of XSS.
 */
export interface AccountMetadata {
  /** Last workspace ID this account was viewing */
  lastWorkspaceId?: string;
  /** Last route path this account was viewing */
  lastRoute?: string;
  /** Timestamp when this account was last active */
  lastActiveAt: number;
  /** Display name cached from user profile */
  displayName?: string;
  /** Avatar URL cached from user profile */
  avatarUrl?: string;
}

/**
 * A stored account with encrypted session data
 */
export interface StoredAccount {
  /** Unique account identifier (user ID) */
  id: string;
  /** Encrypted Supabase session */
  encryptedSession: string;
  /** Account metadata for quick access */
  metadata: AccountMetadata;
  /** When this account was added */
  addedAt: number;
}

/**
 * Extended account information including email from decrypted session
 * Use this for displaying accounts in UI where email is needed
 */
export interface StoredAccountWithEmail extends StoredAccount {
  /** Email address retrieved from encrypted session (requires decryption) */
  email: string;
}

/**
 * The complete multi-session store structure
 */
export interface MultiSessionStore {
  /** All stored accounts */
  accounts: StoredAccount[];
  /** Currently active account ID */
  activeAccountId: string | null;
  /** Version for migration support */
  version: number;
}

/**
 * Options for switching accounts
 */
export interface SwitchAccountOptions {
  /** Target workspace ID to navigate to (overrides remembered workspace) */
  targetWorkspaceId?: string;
  /** Target route to navigate to (overrides remembered route) */
  targetRoute?: string;
}

/**
 * Options for adding a new account
 */
export interface AddAccountOptions {
  /** Initial workspace ID */
  workspaceId?: string;
  /** Whether to switch to this account immediately */
  switchImmediately?: boolean;
}

/**
 * Result of an account operation
 */
export interface AccountOperationResult {
  success: boolean;
  error?: string;
  accountId?: string;
}

/**
 * Decrypted session with user info
 */
export interface DecryptedAccountSession {
  session: Session;
  user: User;
  metadata: AccountMetadata;
}

/**
 * Configuration for the multi-session store
 */
export interface MultiSessionConfig {
  /** Maximum number of accounts that can be stored */
  maxAccounts?: number;
  /** Storage key prefix */
  storageKey?: string;
  /** Encryption key for sessions (if not provided, will generate) */
  encryptionKey?: string;
}

/**
 * Events emitted by the session store
 */
export type SessionStoreEvent =
  | { type: 'account-added'; accountId: string }
  | { type: 'account-removed'; accountId: string }
  | { type: 'account-switched'; fromId: string | null; toId: string }
  | { type: 'session-refreshed'; accountId: string }
  | { type: 'session-expired'; accountId: string }
  | { type: 'error'; error: string };

/**
 * Listener for session store events
 */
export type SessionStoreListener = (event: SessionStoreEvent) => void;
