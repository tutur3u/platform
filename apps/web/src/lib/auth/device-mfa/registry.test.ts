import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deviceProofHash,
  hasDeviceProof,
  isTrustedAuthenticator,
  mutateDeviceRegistry,
  publicRegistry,
  readRegistry,
} from './registry';

const mocks = vi.hoisted(() => ({
  getUserById: vi.fn(),
  updateUserById: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  eval: vi.fn(),
  redis: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    auth: {
      admin: {
        getUserById: mocks.getUserById,
        updateUserById: mocks.updateUserById,
      },
    },
  })),
}));
vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRatelimitRedisClient: mocks.redis,
}));
const proof = 'test-proof-with-at-least-thirty-two-characters';
const device = {
  factorId: 'factor',
  name: 'Phone',
  verified: true,
  createdAt: '2026-09-20T00:00:00.000Z',
  proofHash: deviceProofHash(proof),
};
const registry = () => ({
  version: 1 as const,
  locked: true,
  devices: [{ ...device }],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserById.mockResolvedValue({
    data: {
      user: {
        app_metadata: { tuturuuu_device_authenticators: registry() },
        factors: [{ id: 'factor', factor_type: 'totp', status: 'verified' }],
      },
    },
    error: null,
  });
  mocks.updateUserById.mockResolvedValue({ error: null });
  mocks.redis.mockResolvedValue({
    set: mocks.set,
    get: mocks.get,
    eval: mocks.eval,
  });
  mocks.set.mockImplementation(async (_key, lease) => {
    mocks.get.mockResolvedValue(lease);
    return 'OK';
  });
  mocks.eval.mockResolvedValue(1);
});

describe('trusted authenticator registry', () => {
  it('rejects malformed stored policy instead of silently unlocking', () => {
    expect(() => readRegistry({ locked: false })).toThrow();
    expect(() =>
      readRegistry({
        ...registry(),
        devices: [{ ...device, proofHash: 'z'.repeat(64) }],
      })
    ).toThrow();
  });
  it('does not trust an identifier, wrong proof, or a pending enrollment', () => {
    expect(hasDeviceProof(registry(), 'other', proof)).toBe(false);
    expect(hasDeviceProof(registry(), 'factor', 'wrong'.repeat(10))).toBe(
      false
    );
    const pending = registry();
    pending.devices[0]!.verified = false;
    expect(hasDeviceProof(pending, 'factor', proof)).toBe(false);
    expect(hasDeviceProof(pending, 'factor', proof, true)).toBe(true);
  });
  it('never returns proof hashes in the management response', () => {
    expect(JSON.stringify(publicRegistry(registry()))).not.toContain(
      device.proofHash
    );
    expect(publicRegistry(registry()).devices[0]).not.toHaveProperty(
      'proofHash'
    );
  });
  it('rejects a revoked factor even if the registry still contains it', async () => {
    mocks.getUserById.mockResolvedValueOnce({
      data: {
        user: {
          app_metadata: { tuturuuu_device_authenticators: registry() },
          factors: [],
        },
      },
      error: null,
    });
    expect(
      await isTrustedAuthenticator('user', { factorId: 'factor', proof })
    ).toBe(false);
    expect(
      await isTrustedAuthenticator('user', { factorId: 'factor', proof })
    ).toBe(true);
  });
  it('fails closed when shared locking is unavailable or already held', async () => {
    mocks.redis.mockResolvedValueOnce(null);
    const change = vi.fn();
    await expect(mutateDeviceRegistry('user', change)).rejects.toMatchObject({
      status: 503,
    });
    mocks.set.mockResolvedValueOnce(null);
    await expect(mutateDeviceRegistry('user', change)).rejects.toMatchObject({
      status: 409,
    });
    expect(change).not.toHaveBeenCalled();
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });
  it('refuses to save after losing the mutation lease', async () => {
    await expect(
      mutateDeviceRegistry('user', async (value) => {
        value.locked = false;
        mocks.get.mockResolvedValue('different-owner');
      })
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.updateUserById).not.toHaveBeenCalled();
    expect(mocks.eval).toHaveBeenCalledOnce();
  });
  it('saves only validated server-owned metadata and releases the lease', async () => {
    await mutateDeviceRegistry('user', async (value) => {
      value.locked = false;
    });
    expect(mocks.updateUserById).toHaveBeenCalledWith('user', {
      app_metadata: {
        tuturuuu_device_authenticators: { ...registry(), locked: false },
      },
    });
    expect(mocks.eval).toHaveBeenCalledOnce();
  });
});
