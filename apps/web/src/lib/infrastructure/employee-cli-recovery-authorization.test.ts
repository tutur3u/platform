import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { createCliAppSession } from '@tuturuuu/auth/cli-session';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ current: vi.fn(), mfa: vi.fn() }));
vi.mock('./employee-creation-authorization', () => ({
  authorizeCurrentEmployeeActor: mock.current,
}));
vi.mock('@tuturuuu/utils/required-mfa-app-session', () => ({
  isRequiredMfaAppSessionAllowed: mock.mfa,
}));

import { authorizeEmployeeCliRecovery } from './employee-cli-recovery-authorization';

const actor = '10000000-0000-4000-8000-000000000001';
const secret = 'synthetic-recovery-test-secret';
const claims = { userId: actor, email: 'admin@tuturuuu.com' };
const request = (token?: string) =>
  new Request('https://web.test/recovery', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', secret);
  mock.mfa.mockResolvedValue(true);
  mock.current.mockResolvedValue({ authorized: true, actorUserId: actor });
});
afterEach(() => vi.unstubAllEnvs());
it('verifies the unchanged signed CLI access token and binds only verified sub', async () => {
  const token = createCliAppSession(claims, { secret }).access.token;
  const req = request(token);
  expect(await authorizeEmployeeCliRecovery(req)).toEqual({
    authorized: true,
    actorUserId: actor,
  });
  expect(mock.mfa).toHaveBeenCalledWith(
    expect.objectContaining({ sub: actor, origin_app: 'cli' })
  );
  expect(mock.current).toHaveBeenCalledWith(req, {
    id: actor,
    email: claims.email,
  });
});
it('rejects missing, refresh, wrong target/scope/origin, signature and expiry before current authorization', async () => {
  const session = createCliAppSession(claims, { secret });
  const app = (targetApp: string, scopes: string[], originApp = 'cli') =>
    createAppSessionToken(
      { ...claims, targetApp, originApp, scopes },
      { secret }
    ).token;
  const expired = createCliAppSession(claims, {
    secret,
    now: new Date('2000-01-01'),
  }).access.token;
  for (const token of [
    undefined,
    session.refresh.token,
    app('infra', ['cli:access']),
    app('platform', []),
    app('platform', ['cli:access'], 'infra'),
    createCliAppSession(claims, { secret: 'wrong-secret' }).access.token,
    expired,
    `${session.access.token}corrupt`,
  ]) {
    expect(await authorizeEmployeeCliRecovery(request(token))).toEqual({
      authorized: false,
      status: 401,
    });
  }
  expect(mock.current).not.toHaveBeenCalled();
  expect(mock.mfa).not.toHaveBeenCalled();
});
it('fails closed for missing, revoked or unavailable current MFA proof', async () => {
  const req = request(createCliAppSession(claims, { secret }).access.token);
  mock.mfa.mockResolvedValue(false);
  expect(await authorizeEmployeeCliRecovery(req)).toEqual({
    authorized: false,
    status: 403,
  });
  mock.mfa.mockRejectedValue(new Error('unavailable'));
  expect(await authorizeEmployeeCliRecovery(req)).toEqual({
    authorized: false,
    status: 503,
  });
  expect(mock.current).not.toHaveBeenCalled();
});
it.each([401, 403, 503])(
  'preserves current domain/member/permission/Auth failures (%s)',
  async (status) => {
    mock.current.mockResolvedValue({ authorized: false, status });
    expect(
      await authorizeEmployeeCliRecovery(
        request(createCliAppSession(claims, { secret }).access.token)
      )
    ).toEqual({ authorized: false, status });
  }
);
