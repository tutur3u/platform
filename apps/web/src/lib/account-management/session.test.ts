import { hasAuthenticatedBearerToken } from '@tuturuuu/utils/api-proxy-guard';
import { accountAssuranceCredentials } from '@tuturuuu/utils/required-mfa-credentials';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  exchangeRunnerCredential,
  resolveAccountActor,
  type AccountAdmin,
} from './session';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/auth/cli-session', () => ({
  verifyCliAccessToken: vi.fn((token: string) =>
    token === 'ttr_app_cli_fixture'
      ? {
          ok: true,
          claims: { origin_app: 'cli', sub: runnerId, jti: credentialId },
        }
      : { ok: false }
  ),
}));

const runnerId = '90000000-0000-4000-8000-000000000001';
const credentialId = '90000000-0000-4000-8000-000000000002';
const signingKey = 'fixture-key-for-machine-token-boundary';
const req = (token: string) =>
  new NextRequest('https://tuturuuu.com/api/v1/admin/accounts/tests', {
    headers: { Authorization: `Bearer ${token}` },
  });
afterEach(() => vi.unstubAllEnvs());

describe('Accounts credential boundary', () => {
  it('exchanges a runner secret for a token valid only on test routes', async () => {
    vi.stubEnv('ACCOUNTS_MACHINE_SIGNING_KEY', signingKey);
    const rpc = vi.fn(async () => ({
      data: { runnerId, credentialId },
      error: null,
    }));
    const admin = { schema: () => ({ rpc }) } as unknown as AccountAdmin;
    const runner = `ttr_tdbx_${'1'.repeat(64)}`;
    const { accessToken } = await exchangeRunnerCredential(req(runner), admin);
    expect(hasAuthenticatedBearerToken(req(runner).headers)).toBe(true);
    expect(hasAuthenticatedBearerToken(req(accessToken).headers)).toBe(true);
    expect(accountAssuranceCredentials(req(runner))).toEqual([]);
    expect(accountAssuranceCredentials(req(accessToken))).toEqual([]);
    expect(rpc).toHaveBeenCalledWith('accounts_machine_credential', {
      p_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    await expect(resolveAccountActor(req(accessToken), true)).resolves.toEqual({
      kind: 'machine',
      id: runnerId,
      credentialId,
    });
    await expect(resolveAccountActor(req(accessToken))).rejects.toMatchObject({
      status: 401,
    });
    await expect(resolveAccountActor(req(runner), true)).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      exchangeRunnerCredential(req('ttr_app_cli_fixture'), admin)
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      resolveAccountActor(req('ttr_app_cli_fixture'), true)
    ).resolves.toMatchObject({ kind: 'human' });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it.each([
    ['tuturuuu:accounts:test', 'JWT'],
    ['tuturuuu:platform', 'tuturuuu-accounts-machine+jwt'],
  ])('rejects a signed token for audience %s and type %s', async (aud, typ) => {
    vi.stubEnv('ACCOUNTS_MACHINE_SIGNING_KEY', signingKey);
    const token = await new SignJWT({ credentialId })
      .setProtectedHeader({ alg: 'HS256', typ })
      .setIssuer('tuturuuu-accounts')
      .setAudience(aud)
      .setSubject(runnerId)
      .setIssuedAt()
      .setExpirationTime('120s')
      .sign(new TextEncoder().encode(signingKey));
    const wrapped = `ttr_accounts_machine_${Buffer.from(token).toString('base64url')}`;
    await expect(resolveAccountActor(req(wrapped), true)).rejects.toMatchObject(
      {
        status: 401,
      }
    );
  });
});
