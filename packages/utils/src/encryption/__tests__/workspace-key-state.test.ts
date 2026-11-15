import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EncryptionUnavailableError } from '../encryption-required';
import {
  encryptWorkspaceKey,
  generateWorkspaceKey,
} from '../encryption-service';
import {
  resolveWorkspaceKeyState,
  type WorkspaceKeyState,
  workspaceKeyForWrite,
} from '../workspace-key-state';

const MASTER_KEY = 'workspace-key-state-test-master-key';
const OTHER_MASTER_KEY = 'workspace-key-state-other-master-key';

let workspaceKey: Buffer;
let wrappedKey: string;

beforeEach(async () => {
  workspaceKey = generateWorkspaceKey();
  wrappedKey = await encryptWorkspaceKey(workspaceKey, MASTER_KEY);
  vi.stubEnv('ENCRYPTION_MASTER_KEY', MASTER_KEY);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const withRow = async () => ({ encrypted_key: wrappedKey });
const withoutRow = async () => null;

describe('resolveWorkspaceKeyState', () => {
  it('returns none for a workspace without a key row', async () => {
    const state = await resolveWorkspaceKeyState('ws', withoutRow);
    expect(state).toEqual({ status: 'none' });
  });

  it('returns none without a key row when the master key is missing', async () => {
    vi.stubEnv('ENCRYPTION_MASTER_KEY', '');
    const lookup = vi.fn(withoutRow);
    const state = await resolveWorkspaceKeyState('ws', lookup);
    expect(state).toEqual({ status: 'none' });
    expect(lookup).toHaveBeenCalledWith('ws');
  });

  it('returns the unwrapped key when the master key is present', async () => {
    const state = await resolveWorkspaceKeyState('ws', withRow);
    if (state.status !== 'available') throw new Error(state.status);
    expect(state.key.equals(workspaceKey)).toBe(true);
  });

  it('reports a key row without a master key as unavailable', async () => {
    vi.stubEnv('ENCRYPTION_MASTER_KEY', '');
    const state = await resolveWorkspaceKeyState('ws', withRow);
    expect(state).toEqual({
      status: 'unavailable',
      reason: 'master_key_missing',
    });
  });

  it('reports a key the master key cannot unwrap as unavailable', async () => {
    vi.stubEnv('ENCRYPTION_MASTER_KEY', OTHER_MASTER_KEY);
    const state = await resolveWorkspaceKeyState('ws', withRow);
    expect(state).toMatchObject({
      status: 'unavailable',
      reason: 'key_unwrap_failed',
    });
  });

  it('reports a failed lookup as unavailable, never none', async () => {
    const cause = new Error('lookup unavailable');
    const lookup = async () => {
      throw cause;
    };
    const state = await resolveWorkspaceKeyState('ws', lookup);
    expect(state).toEqual({
      status: 'unavailable',
      reason: 'lookup_failed',
      cause,
    });
  });
});

describe('workspaceKeyForWrite', () => {
  it('allows plaintext only for a workspace without a key row', () => {
    expect(workspaceKeyForWrite({ status: 'none' })).toBeNull();
  });

  it('returns the usable key', () => {
    const key = generateWorkspaceKey();
    expect(workspaceKeyForWrite({ status: 'available', key })).toBe(key);
  });

  it('refuses the write for every unavailable reason', () => {
    const reasons = [
      'lookup_failed',
      'master_key_missing',
      'key_unwrap_failed',
    ] as const;
    for (const reason of reasons) {
      const state: WorkspaceKeyState = { status: 'unavailable', reason };
      expect(() => workspaceKeyForWrite(state)).toThrow(
        EncryptionUnavailableError
      );
    }
  });
});
