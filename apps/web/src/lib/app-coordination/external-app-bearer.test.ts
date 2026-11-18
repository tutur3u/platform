import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getExternalAppById: vi.fn() }));

vi.mock('./external-apps', () => ({
  getExternalAppById: mocks.getExternalAppById,
}));

import {
  rejectStaleExternalAppBearer,
  verifyExternalAppBearerIssuer,
  wasIssuedBeforeSecretRotation,
} from './external-app-bearer';

const admin = {} as never;
const rotatedAt = '2026-11-01T12:00:00.500Z';
const rotatedAtSeconds = Math.floor(Date.parse(rotatedAt) / 1000);

function registeredApp(overrides: Record<string, unknown> = {}) {
  return {
    allowedWorkspaceIds: [],
    enabled: true,
    id: 'fysh',
    secretIssuedAt: rotatedAt,
    ...overrides,
  };
}

describe('wasIssuedBeforeSecretRotation', () => {
  it('compares the bearer issue time with the current secret at second precision', () => {
    expect(
      wasIssuedBeforeSecretRotation({ iat: rotatedAtSeconds - 1 }, rotatedAt)
    ).toBe(true);
    expect(
      wasIssuedBeforeSecretRotation({ iat: rotatedAtSeconds }, rotatedAt)
    ).toBe(false);
    expect(
      wasIssuedBeforeSecretRotation({ iat: rotatedAtSeconds + 60 }, rotatedAt)
    ).toBe(false);
  });

  it('skips the comparison when no secret was ever issued', () => {
    expect(wasIssuedBeforeSecretRotation({ iat: 1 }, null)).toBe(false);
  });

  it('fails closed on an unreadable issue time', () => {
    expect(wasIssuedBeforeSecretRotation({ iat: 1 }, 'not-a-date')).toBe(true);
    expect(
      wasIssuedBeforeSecretRotation({ iat: undefined as never }, rotatedAt)
    ).toBe(true);
  });
});

describe('verifyExternalAppBearerIssuer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getExternalAppById.mockResolvedValue(registeredApp());
  });

  it('accepts a bearer from an enabled app minted after the current secret', async () => {
    const result = await verifyExternalAppBearerIssuer({
      admin,
      claims: { iat: rotatedAtSeconds + 5, target_app: 'fysh' },
    });

    expect(result).toMatchObject({ app: { id: 'fysh' }, ok: true });
    expect(mocks.getExternalAppById).toHaveBeenCalledWith('fysh', admin);
  });

  it('rejects a bearer from a disabled or removed app', async () => {
    mocks.getExternalAppById.mockResolvedValueOnce(
      registeredApp({ enabled: false })
    );
    await expect(
      verifyExternalAppBearerIssuer({
        admin,
        claims: { iat: rotatedAtSeconds + 5, target_app: 'fysh' },
      })
    ).resolves.toEqual({ ok: false, reason: 'app_disabled' });

    mocks.getExternalAppById.mockResolvedValueOnce(null);
    await expect(
      verifyExternalAppBearerIssuer({
        admin,
        claims: { iat: rotatedAtSeconds + 5, target_app: 'fysh' },
      })
    ).resolves.toEqual({ ok: false, reason: 'app_disabled' });
  });

  it('treats an unregistrable app id as an unknown app', async () => {
    mocks.getExternalAppById.mockRejectedValueOnce(new Error('invalid_app_id'));

    await expect(
      verifyExternalAppBearerIssuer({
        admin,
        claims: { iat: rotatedAtSeconds + 5, target_app: 'Bad App' },
      })
    ).resolves.toEqual({ ok: false, reason: 'app_disabled' });
  });

  it('rejects a bearer minted before the secret was rotated', async () => {
    await expect(
      verifyExternalAppBearerIssuer({
        admin,
        claims: { iat: rotatedAtSeconds - 1, target_app: 'fysh' },
      })
    ).resolves.toEqual({ ok: false, reason: 'secret_rotated' });
  });

  it('fails closed when the registry cannot be read', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mocks.getExternalAppById.mockRejectedValueOnce(new Error('db down'));

    await expect(
      verifyExternalAppBearerIssuer({
        admin,
        claims: { iat: rotatedAtSeconds + 5, target_app: 'fysh' },
      })
    ).resolves.toEqual({ ok: false, reason: 'lookup_failed' });
    consoleError.mockRestore();
  });
});

describe('rejectStaleExternalAppBearer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getExternalAppById.mockResolvedValue(registeredApp());
  });

  it('maps each outcome to a response the client can act on', async () => {
    await expect(
      rejectStaleExternalAppBearer(admin, {
        iat: rotatedAtSeconds + 5,
        target_app: 'fysh',
      })
    ).resolves.toBeNull();

    const rotated = await rejectStaleExternalAppBearer(admin, {
      iat: rotatedAtSeconds - 1,
      target_app: 'fysh',
    });
    expect(rotated?.status).toBe(401);

    mocks.getExternalAppById.mockResolvedValueOnce(
      registeredApp({ enabled: false })
    );
    const disabled = await rejectStaleExternalAppBearer(admin, {
      iat: rotatedAtSeconds + 5,
      target_app: 'fysh',
    });
    expect(disabled?.status).toBe(403);
    await expect(disabled?.json()).resolves.toEqual({ error: 'Forbidden' });
  });
});
