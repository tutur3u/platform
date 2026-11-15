import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  encryptEventForStorage,
  getWorkspaceKey,
} from './workspace-encryption';

const mocks = vi.hoisted(() => ({ keyRowLookup: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: mocks.keyRowLookup,
      insert: async () => ({ error: new Error('key creation disabled') }),
    };
    return { from: () => query };
  },
}));

// Block bodies: a function returned from a hook runs as its teardown.
const withKeyRow = () => {
  mocks.keyRowLookup.mockResolvedValue({
    data: { ws_id: 'ws', encrypted_key: 'wrapped' },
    error: null,
  });
};
const withoutKeyRow = () => {
  mocks.keyRowLookup.mockResolvedValue({ data: null, error: null });
};

beforeEach(() => {
  mocks.keyRowLookup.mockReset();
  withKeyRow();
});
afterEach(() => vi.unstubAllEnvs());

const event = {
  title: 'Salary review',
  description: 'private',
  location: null,
};

describe('encryptEventForStorage without a key', () => {
  it('refuses to store plaintext for a workspace with a key row where encryption is required', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENCRYPTION_MASTER_KEY', '');
    await expect(
      encryptEventForStorage('ws', event, null)
    ).rejects.toMatchObject({
      code: 'ENCRYPTION_UNAVAILABLE',
    });
    await expect(encryptEventForStorage('ws', event)).rejects.toMatchObject({
      code: 'ENCRYPTION_UNAVAILABLE',
    });
  });

  it('refuses when the key row cannot be checked', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENCRYPTION_MASTER_KEY', '');
    mocks.keyRowLookup.mockResolvedValue({
      data: null,
      error: new Error('lookup unavailable'),
    });
    await expect(
      encryptEventForStorage('ws', event, null)
    ).rejects.toMatchObject({ code: 'ENCRYPTION_UNAVAILABLE' });
  });

  it('refuses when only TUTURUUU_REQUIRE_SECRETS is set', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TUTURUUU_REQUIRE_SECRETS', '1');
    vi.stubEnv('ENCRYPTION_MASTER_KEY', '');
    await expect(
      encryptEventForStorage('ws', event, null)
    ).rejects.toMatchObject({ code: 'ENCRYPTION_UNAVAILABLE' });
  });

  it('stores plaintext for a workspace without a key row where encryption is required', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENCRYPTION_MASTER_KEY', 'configured-master-key');
    withoutKeyRow();
    // Callers pass the read-only key lookup, which is null without a key row.
    const workspaceKey = await getWorkspaceKey('ws');
    expect(workspaceKey).toBeNull();
    expect(await encryptEventForStorage('ws', event, workspaceKey)).toEqual({
      ...event,
      is_encrypted: false,
    });
  });

  it('still stores plaintext in development and when explicitly opted out', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ENCRYPTION_MASTER_KEY', '');
    expect(await encryptEventForStorage('ws', event, null)).toEqual({
      ...event,
      is_encrypted: false,
    });
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENCRYPTION_REQUIRED', '0');
    expect((await encryptEventForStorage('ws', event, null)).is_encrypted).toBe(
      false
    );
  });
});
