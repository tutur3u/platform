// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountAssuranceDependencies } from '../required-mfa-request';

const check = vi.hoisted(() => vi.fn());
vi.mock('../required-mfa-request', () => ({ checkRequiredAccountMfa: check }));

import {
  guardRequiredAccountMfa,
  isAccountAssuranceRecoveryPath,
} from '../required-mfa-proxy';

const dependencies = {} as AccountAssuranceDependencies;
function request(
  path = '/api/v1/workspaces',
  headers: HeadersInit = { authorization: 'Bearer eyJtest' }
) {
  return new NextRequest(`https://tuturuuu.com${path}`, { headers });
}

beforeEach(() => {
  check.mockReset();
  check.mockResolvedValue({ status: 'allowed', userId: 'actor' });
});

describe('required MFA proxy responses', () => {
  it('leaves anonymous requests to route authentication', async () => {
    expect(
      await guardRequiredAccountMfa(
        request('/api/v1/public', {}),
        dependencies,
        { userId: 'actor' }
      )
    ).toBeNull();
    expect(check).not.toHaveBeenCalled();
  });
  it.each([
    ['authorization', 'Bearer eyJtest'],
    ['authorization', 'Bearer ttr_app_test'],
    ['cookie', 'sb-project-auth-token.0=token'],
    ['cookie', 'tuturuuu_web_app_session=token'],
    ['cookie', 'tuturuuu_app_session=token'],
  ])('checks interactive credential %s', async (name, value) => {
    expect(
      await guardRequiredAccountMfa(
        request(undefined, { [name]: value }),
        dependencies,
        { userId: 'actor' }
      )
    ).toBeNull();
    expect(check).toHaveBeenCalledOnce();
  });
  it.each([
    ['required', 403, 'MFA_REQUIRED'],
    ['invalid', 401, 'UNAUTHENTICATED'],
    ['unavailable', 503, 'AUTH_UNAVAILABLE'],
  ])(
    'returns a bounded no-store response for %s',
    async (status, httpStatus, code) => {
      check.mockResolvedValue({ status, userId: 'private-actor-id' });
      const result = await guardRequiredAccountMfa(request(), dependencies, {
        userId: 'actor',
      });
      expect(result?.status).toBe(httpStatus);
      expect(result?.headers.get('Cache-Control')).toBe('no-store');
      const body = await result!.json();
      expect(body.code).toBe(code);
      expect(JSON.stringify(body)).not.toContain('private-actor-id');
    }
  );
  it.each([
    '/api/auth/verify-app-token',
    '/api/auth/refresh-app-session',
    '/api/v1/auth/cross-app-token/verify',
    '/api/v1/auth/cross-app-session/refresh',
    '/api/cli/auth/refresh',
    '/api/v1/auth/mfa/devices',
    '/api/v1/auth/mfa/mobile/challenges',
    '/api/v1/auth/mfa/mobile/approvals',
    '/api/v1/auth/mfa/mobile/challenges/00000000-0000-4000-8000-000000000001',
    '/api/v1/auth/mfa/mobile/challenges/00000000-0000-4000-8000-000000000001/approve',
    '/api/v1/auth/accounts/logout',
    '/api/v1/auth/accounts/logout-all',
  ])('allows assurance establishment/recovery route %s', async (path) => {
    expect(
      await guardRequiredAccountMfa(request(path), dependencies, {
        userId: 'actor',
      })
    ).toBeNull();
    expect(check).not.toHaveBeenCalled();
  });
  it.each([
    '/api/auth/refresh-app-session/anything',
    '/api/v1/auth/cross-app-session/refresh/anything',
    '/api/v1/auth/mfa/devices/anything',
    '/api/v1/auth/mfa/mobile/challenges/invalid',
    '/api/v1/auth/mfa/mobile/challenges/00000000-0000-4000-8000-000000000001/approve/anything',
    '/api/v1/infrastructure/internal-accounts',
    '/api/v1/users/me',
    '/api/v1/workspaces',
  ])('does not exempt protected or unknown route %s', (path) => {
    expect(isAccountAssuranceRecoveryPath(path)).toBe(false);
  });
});
