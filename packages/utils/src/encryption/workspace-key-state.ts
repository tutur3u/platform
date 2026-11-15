/**
 * Workspace key state for end-to-end encrypted calendar data.
 *
 * A workspace is end-to-end encrypted when it has a `workspace_encryption_keys`
 * row, whether or not this runtime can unwrap the key. The key row is looked
 * up independently of the master key, so a missing `ENCRYPTION_MASTER_KEY`
 * never makes an encrypted workspace look unencrypted.
 *
 * The row lookup is injected so this module stays independent of any
 * database client; app adapters pass a lookup backed by their admin client.
 */

import { EncryptionUnavailableError } from './encryption-required';
import {
  decryptWorkspaceKey,
  getMasterKey,
  isEncryptionEnabled,
} from './encryption-service';

export type WorkspaceKeyUnavailableReason =
  | 'lookup_failed'
  | 'master_key_missing'
  | 'key_unwrap_failed';

export type WorkspaceKeyState =
  | { status: 'none' }
  | { status: 'available'; key: Buffer }
  | {
      status: 'unavailable';
      reason: WorkspaceKeyUnavailableReason;
      cause?: unknown;
    };

/** Returns the wrapped key row for a workspace, or null when it has none. */
export type WorkspaceKeyRowLookup = (
  wsId: string
) => Promise<{ encrypted_key: string } | null>;

/**
 * Resolve whether a workspace has no key, a usable key, or a key row this
 * runtime cannot use. Lookup errors resolve to `unavailable`, never `none`.
 */
export async function resolveWorkspaceKeyState(
  wsId: string,
  lookupKeyRow: WorkspaceKeyRowLookup
): Promise<WorkspaceKeyState> {
  let row: { encrypted_key: string } | null;
  try {
    row = await lookupKeyRow(wsId);
  } catch (cause) {
    return { status: 'unavailable', reason: 'lookup_failed', cause };
  }

  if (!row) return { status: 'none' };
  if (!isEncryptionEnabled())
    return { status: 'unavailable', reason: 'master_key_missing' };

  try {
    const key = await decryptWorkspaceKey(row.encrypted_key, getMasterKey());
    return { status: 'available', key };
  } catch (cause) {
    return { status: 'unavailable', reason: 'key_unwrap_failed', cause };
  }
}

/**
 * The key to encrypt a write with: null for a workspace without a key row
 * (plaintext is allowed), the key when usable, and a thrown
 * `EncryptionUnavailableError` when the workspace is encrypted but its key
 * cannot be used, so the write never stores plaintext.
 */
export function workspaceKeyForWrite(state: WorkspaceKeyState): Buffer | null {
  if (state.status === 'none') return null;
  if (state.status === 'available') return state.key;
  throw new EncryptionUnavailableError(
    `Workspace encryption key is unavailable (${state.reason}); refusing to store plaintext`
  );
}
