// @vitest-environment node
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { refreshSepayAccessToken } from './sepay-api';
import {
  createSepayOauthState,
  getSepayOauthEnv,
  verifySepayOauthState,
} from './sepay-oauth';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('holds SePay OAuth until provider credentials are configured', () => {
  vi.stubEnv('SEPAY_OAUTH_CLIENT_ID', 'synthetic-client');
  vi.stubEnv('SEPAY_OAUTH_CLIENT_SECRET', 'synthetic-secret');
  vi.stubEnv('SEPAY_OAUTH_STATE_SECRET', undefined);
  vi.stubEnv('SEPAY_OAUTH_TOKEN_ENCRYPTION_SECRET', 'synthetic-key');
  vi.stubEnv('SEPAY_WEBHOOK_API_KEY', undefined);
  vi.stubEnv('SEPAY_WEBHOOK_SECRET', undefined);

  expect(getSepayOauthEnv()).toBeNull();
  vi.stubEnv('SEPAY_WEBHOOK_API_KEY', 'synthetic-webhook');
  expect(getSepayOauthEnv()).toMatchObject({ clientId: 'synthetic-client' });

  vi.stubEnv('SEPAY_OAUTH_CLIENT_SECRET', '');
  expect(getSepayOauthEnv()).toBeNull();
});

it('keeps the existing refresh token when SePay returns only an access token', async () => {
  vi.stubEnv('SEPAY_OAUTH_CLIENT_ID', 'synthetic-client');
  vi.stubEnv('SEPAY_OAUTH_CLIENT_SECRET', 'synthetic-secret');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ access_token: 'synthetic-new' }))
  );

  await expect(
    refreshSepayAccessToken({ refreshToken: 'synthetic-refresh' })
  ).resolves.toMatchObject({
    accessToken: 'synthetic-new',
    refreshToken: 'synthetic-refresh',
  });
});

it.each([
  { stateKey: 'synthetic-state-key', key: 'synthetic-state-key' },
  { stateKey: undefined, key: 'synthetic-client-secret' },
])(
  'keeps version 1 state interoperable with $key',
  async ({ stateKey, key }) => {
    vi.stubEnv('SEPAY_OAUTH_STATE_SECRET', stateKey);
    vi.stubEnv('SEPAY_OAUTH_CLIENT_SECRET', 'synthetic-client-secret');
    const wsId = 'workspace-a';
    const payload = Buffer.from(
      JSON.stringify({
        expiresAt: Date.now() + 60_000,
        nonce: 'fixture',
        version: 1,
        wsId,
      })
    ).toString('base64url');
    const legacyState = `${payload}.${createHmac('sha256', key).update(payload).digest('base64url')}`;

    await expect(
      verifySepayOauthState({
        expectedState: legacyState,
        state: legacyState,
        wsId,
      })
    ).resolves.toEqual({ ok: true });

    const { state } = await createSepayOauthState({ wsId });
    const [encoded, signature] = state.split('.');
    assert(encoded && signature);
    expect(signature).toBe(
      createHmac('sha256', key).update(encoded).digest('base64url')
    );
  }
);

it('rejects altered, mismatched, expired, and cross-workspace state', async () => {
  vi.stubEnv('SEPAY_OAUTH_STATE_SECRET', 'synthetic-state-key');
  const wsId = 'workspace-a';
  const { state } = await createSepayOauthState({ wsId });
  const { state: expired } = await createSepayOauthState({ ttlMs: -1, wsId });
  const [payload, signature] = state.split('.');
  assert(payload && signature);
  const forged = `${payload}.${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
  const padded = `${state}=`;

  for (const input of [
    { expectedState: forged, state: forged, wsId },
    { expectedState: padded, state: padded, wsId },
    { expectedState: expired, state: expired, wsId },
    { expectedState: forged, state, wsId },
    { expectedState: null, state, wsId },
    { expectedState: state, state, wsId: 'workspace-b' },
  ]) {
    await expect(verifySepayOauthState(input)).resolves.toEqual({ ok: false });
  }

  vi.stubEnv('SEPAY_OAUTH_STATE_SECRET', 'synthetic-different-key');
  await expect(
    verifySepayOauthState({ expectedState: state, state, wsId })
  ).resolves.toEqual({ ok: false });
});
