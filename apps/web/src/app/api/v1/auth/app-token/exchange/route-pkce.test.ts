import './route-test-support';
import { describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import {
  createAdminClientMock,
  createExchangeRequest,
  mockRegisteredApp,
  mocks,
  registerExchangeTestSetup,
  victimUserId,
  workspaceId,
} from './route-test-support';

const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const redeemed = {
  data: [
    { session_data: { email: 'victim@example.com' }, user_id: victimUserId },
  ],
  error: null,
};

function useAdminRpc(result: unknown = redeemed) {
  const rpc = vi.fn().mockResolvedValue(result);
  mocks.createAdminClient.mockResolvedValue({
    ...createAdminClientMock(),
    rpc,
  });
  return rpc;
}

async function registerApp(requirePkce: boolean) {
  mockRegisteredApp();
  const registered = await mocks.verifyExternalAppSecret();
  mocks.verifyExternalAppSecret.mockResolvedValue({
    ...registered,
    app: { ...registered.app, callbackPaths: [], requirePkce },
  });
}

const exchange = (body: Record<string, unknown> = {}) =>
  POST(
    createExchangeRequest({
      appId: 'yoola',
      appSecret: 'ttr_app_secret_test',
      requestedScopes: ['external-projects:read'],
      token: 'handoff-token',
      workspaceId,
      ...body,
    })
  );

describe('app token exchange PKCE verification', () => {
  registerExchangeTestSetup();

  it('keeps legacy apps on the anonymous redemption without a verifier', async () => {
    await registerApp(false);
    const adminRpc = useAdminRpc();
    const response = await exchange();

    expect(response.status).toBe(200);
    const anonClient = await mocks.createClient.mock.results[0]?.value;
    expect(anonClient.rpc).toHaveBeenCalledWith(
      'validate_cross_app_token_with_session',
      { p_target_app: 'yoola', p_token: 'handoff-token' }
    );
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it('refuses a PKCE app exchange without a verifier', async () => {
    await registerApp(true);
    const adminRpc = useAdminRpc();
    const response = await exchange();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PKCE_REQUIRED',
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it('redeems a verifier through the service_role overload', async () => {
    await registerApp(true);
    const adminRpc = useAdminRpc();
    const response = await exchange({ codeVerifier: verifier });

    expect(response.status).toBe(200);
    expect(adminRpc).toHaveBeenCalledWith(
      'validate_cross_app_token_with_session',
      {
        p_code_verifier: verifier,
        p_target_app: 'yoola',
        p_token: 'handoff-token',
      }
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('rejects a wrong verifier the database refuses', async () => {
    await registerApp(true);
    useAdminRpc({ data: [{ session_data: null, user_id: null }], error: null });
    const response = await exchange({ codeVerifier: `x${verifier.slice(1)}` });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid or expired token',
    });
  });

  it.each([
    ['too short', 'a'.repeat(42)],
    ['too long', 'a'.repeat(129)],
    ['outside the RFC 7636 charset', `${'a'.repeat(42)}+`],
  ])(
    'rejects a verifier %s before redemption',
    async (_label, codeVerifier) => {
      await registerApp(true);
      const adminRpc = useAdminRpc();
      const response = await exchange({ codeVerifier });

      expect(response.status).toBe(400);
      expect(adminRpc).not.toHaveBeenCalled();
      expect(mocks.createClient).not.toHaveBeenCalled();
    }
  );

  it('lets a legacy app opt into a verifier', async () => {
    await registerApp(false);
    const adminRpc = useAdminRpc();
    const response = await exchange({ codeVerifier: verifier });

    expect(response.status).toBe(200);
    expect(adminRpc).toHaveBeenCalledWith(
      'validate_cross_app_token_with_session',
      expect.objectContaining({ p_code_verifier: verifier })
    );
  });
});
