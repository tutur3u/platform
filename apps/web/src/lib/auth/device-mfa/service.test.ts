import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceMfaRequest } from './service';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  assurance: vi.fn(),
  listFactors: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
  load: vi.fn(),
  mutate: vi.fn(),
  proof: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('./registry', async (original) => ({
  ...(await original<typeof import('./registry')>()),
  loadDeviceRegistry: mocks.load,
  mutateDeviceRegistry: mocks.mutate,
  hasDeviceProof: mocks.proof,
}));
const factorId = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';
const device = {
  factorId,
  name: 'Phone',
  verified: true,
  proofHash: 'a'.repeat(64),
  createdAt: '2026-09-20T00:00:00Z',
};
const request = new Request('https://tuturuuu.com/api/v1/auth/mfa/devices', {
  headers: { authorization: 'Bearer test-token' },
});
let registry: { version: 1; locked: boolean; devices: (typeof device)[] };
beforeEach(() => {
  vi.clearAllMocks();
  registry = { version: 1, locked: false, devices: [{ ...device }] };
  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: mocks.getUser,
      mfa: {
        getAuthenticatorAssuranceLevel: mocks.assurance,
        listFactors: mocks.listFactors,
        enroll: mocks.enroll,
        unenroll: mocks.unenroll,
      },
    },
  });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'user' } },
    error: null,
  });
  mocks.assurance.mockResolvedValue({
    data: { currentLevel: 'aal2', nextLevel: 'aal2' },
    error: null,
  });
  mocks.listFactors.mockResolvedValue({
    data: {
      totp: [{ id: factorId, status: 'verified' }],
      all: [{ id: factorId }],
    },
    error: null,
  });
  mocks.proof.mockReturnValue(true);
  mocks.load.mockImplementation(async () => registry);
  mocks.mutate.mockImplementation(async (_userId, action) => action(registry));
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.unenroll.mockResolvedValue({ error: null });
});

describe('device registration policy', () => {
  it('passes the mobile JWT to the stateless assurance check', async () => {
    await deviceMfaRequest(request, {
      action: 'confirm',
      factorId,
      proof: 'p'.repeat(32),
    });
    expect(mocks.assurance).toHaveBeenCalledWith('test-token');
  });
  it('rejects missing assurance instead of enrolling without verified AAL', async () => {
    mocks.assurance.mockResolvedValueOnce({
      data: { currentLevel: null, nextLevel: null },
      error: null,
    });
    await expect(
      deviceMfaRequest(request, { action: 'enroll', name: 'Phone' })
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('preserves cookie session assurance for web requests', async () => {
    await deviceMfaRequest(new Request(request.url), {
      action: 'confirm',
      factorId,
      proof: 'p'.repeat(32),
    });
    expect(mocks.assurance).toHaveBeenCalledWith(undefined);
  });

  it('uses request-scoped authentication and rejects anonymous callers', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(deviceMfaRequest(request)).rejects.toMatchObject({
      status: 401,
    });
    expect(mocks.createClient).toHaveBeenCalledWith(request);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('enforces the registration lock before contacting the enrollment provider', async () => {
    registry.locked = true;
    await expect(
      deviceMfaRequest(request, { action: 'enroll', name: 'Tablet' })
    ).rejects.toMatchObject({ status: 423 });
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it('requires existing MFA before registering an additional device', async () => {
    mocks.assurance.mockResolvedValueOnce({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });
    await expect(
      deviceMfaRequest(request, { action: 'enroll', name: 'Tablet' })
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('does not allow a password-only session to change policy', async () => {
    mocks.assurance.mockResolvedValueOnce({
      data: { currentLevel: 'aal1', nextLevel: 'aal1' },
      error: null,
    });
    await expect(
      deviceMfaRequest(request, {
        action: 'policy',
        factorId,
        proof: 'p'.repeat(32),
        locked: false,
      })
    ).rejects.toMatchObject({ status: 403 });
  });
  it('requires trusted proof to unlock registration', async () => {
    registry.locked = true;
    mocks.proof.mockReturnValueOnce(false);
    await expect(
      deviceMfaRequest(request, {
        action: 'policy',
        factorId,
        proof: 'p'.repeat(32),
        locked: false,
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(registry.locked).toBe(true);
  });
  it('requires a verified backup before locking', async () => {
    registry.devices.push({ ...device, factorId: secondId });
    await expect(
      deviceMfaRequest(request, {
        action: 'policy',
        factorId,
        proof: 'p'.repeat(32),
        locked: true,
      })
    ).rejects.toMatchObject({ status: 409 });
    mocks.listFactors.mockResolvedValueOnce({
      data: {
        totp: [
          { id: factorId, status: 'verified' },
          { id: secondId, status: 'verified' },
        ],
      },
      error: null,
    });
    await deviceMfaRequest(request, {
      action: 'policy',
      factorId,
      proof: 'p'.repeat(32),
      locked: true,
    });
    expect(registry.locked).toBe(true);
  });
  it('cannot confirm an incomplete registration after the policy is locked', async () => {
    registry.locked = true;
    registry.devices[0]!.verified = false;
    await expect(
      deviceMfaRequest(request, {
        action: 'confirm',
        factorId,
        proof: 'p'.repeat(32),
      })
    ).rejects.toMatchObject({ status: 423 });
  });
  it('cannot remove the last trusted authenticator while locked', async () => {
    registry.locked = true;
    await expect(
      deviceMfaRequest(request, {
        action: 'remove',
        factorId,
        proof: 'p'.repeat(32),
        targetFactorId: factorId,
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.unenroll).not.toHaveBeenCalled();
  });
  it('does not count an externally revoked backup as recovery', async () => {
    registry.locked = true;
    registry.devices.push({ ...device, factorId: secondId });
    await expect(
      deviceMfaRequest(request, {
        action: 'remove',
        factorId,
        proof: 'p'.repeat(32),
        targetFactorId: factorId,
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.unenroll).not.toHaveBeenCalled();
  });
  it('keeps registry entries if provider revocation fails', async () => {
    mocks.unenroll.mockResolvedValueOnce({ error: new Error('offline') });
    await expect(
      deviceMfaRequest(request, {
        action: 'remove',
        factorId,
        proof: 'p'.repeat(32),
        targetFactorId: factorId,
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(registry.devices).toHaveLength(1);
  });
});
