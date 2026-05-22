import {
  APP_COORDINATION_SESSION_POLICY_SECRET_NAME,
  DEFAULT_APP_COORDINATION_SESSION_POLICY,
} from '@tuturuuu/auth/app-session-policy';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAppCoordinationSessionPolicyCache,
  getAppCoordinationSessionPolicy,
  saveAppCoordinationSessionPolicy,
} from './session-policy';

function createSecretDb(initialValue: string | null = null) {
  const state = {
    deleted: false,
    inserted: null as unknown,
    value: initialValue,
  };
  const maybeSingle = vi.fn().mockResolvedValue({
    data: state.value === null ? null : { value: state.value },
    error: null,
  });
  const selectBuilder = {
    eq: vi.fn(() => selectBuilder),
    maybeSingle,
  };
  const deleteBuilder = {
    eq: vi.fn(() => deleteBuilder),
  };
  const from = vi.fn((table: string) => {
    expect(table).toBe('workspace_secrets');
    return {
      delete: vi.fn(() => {
        state.deleted = true;
        return deleteBuilder;
      }),
      insert: vi.fn((payload: unknown) => {
        state.inserted = payload;
        return Promise.resolve({ error: null });
      }),
      select: vi.fn(() => selectBuilder),
    };
  });
  const db = { from } as unknown as TypedSupabaseClient;

  return {
    db,
    deleteBuilder,
    selectBuilder,
    state,
  };
}

describe('app coordination session policy storage', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    clearAppCoordinationSessionPolicyCache();
  });

  it('uses defaults when the root workspace secret is missing', async () => {
    const { db } = createSecretDb();

    await expect(
      getAppCoordinationSessionPolicy({ db })
    ).resolves.toMatchObject({
      policy: DEFAULT_APP_COORDINATION_SESSION_POLICY,
      source: 'default',
    });
  });

  it('uses compatibility environment fallback when the secret is invalid', async () => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_TOKEN_TTL_SECONDS', '3600');
    const { db } = createSecretDb('{nope');

    await expect(
      getAppCoordinationSessionPolicy({ db })
    ).resolves.toMatchObject({
      policy: expect.objectContaining({
        externalAppBearerTtlSeconds: 3600,
      }),
      source: 'environment',
    });
  });

  it('round-trips a valid policy through workspace_secrets', async () => {
    const { db, state } = createSecretDb();
    const policy = {
      ...DEFAULT_APP_COORDINATION_SESSION_POLICY,
      internalAppAccessTtlSeconds: 900,
      internalAppOverrides: {
        learn: {
          internalAppAccessTtlSeconds: 600,
          internalAppRefreshEarlySeconds: 120,
          internalAppRefreshTtlSeconds: 172_800,
        },
      },
    };

    await expect(
      saveAppCoordinationSessionPolicy({ db, policy })
    ).resolves.toEqual(policy);

    expect(state.deleted).toBe(true);
    expect(state.inserted).toEqual({
      name: APP_COORDINATION_SESSION_POLICY_SECRET_NAME,
      value: JSON.stringify(policy),
      ws_id: ROOT_WORKSPACE_ID,
    });
  });

  it('rejects out-of-range saved policy values', async () => {
    const { db } = createSecretDb();

    await expect(
      saveAppCoordinationSessionPolicy({
        db,
        policy: {
          ...DEFAULT_APP_COORDINATION_SESSION_POLICY,
          internalAppAccessTtlSeconds: 60,
        },
      })
    ).rejects.toThrow();
  });
});
