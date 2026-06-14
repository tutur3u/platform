import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getPermissions: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (...args: unknown[]) =>
    mocks.resolveAuthenticatedSessionUser(...args),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: unknown[]) => mocks.getPermissions(...args),
}));

import {
  authorizeMobileDeploymentAdmin,
  MOBILE_DEPLOYMENT_CSRF_HEADER,
  validateSameOriginMutation,
} from './access';

function mutationRequest(headers: HeadersInit = {}) {
  return new Request('https://tuturuuu.com/api/v1/mobile-deployment', {
    headers: {
      [MOBILE_DEPLOYMENT_CSRF_HEADER]: '1',
      ...headers,
    },
    method: 'PUT',
  });
}

describe('mobile deployment access guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: {} });
    mocks.createAdminClient.mockResolvedValue({ schema: vi.fn() });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1' },
    });
  });

  it('allows a mutation with the dedicated action header when Origin is absent', () => {
    expect(validateSameOriginMutation(mutationRequest())).toBeNull();
  });

  it('allows proxied production mutations from the forwarded public origin', () => {
    const request = new Request(
      'https://internal-web-service/api/v1/mobile-deployment',
      {
        headers: {
          [MOBILE_DEPLOYMENT_CSRF_HEADER]: '1',
          origin: 'https://tuturuuu.com',
          'x-forwarded-host': 'tuturuuu.com',
          'x-forwarded-proto': 'https',
        },
        method: 'PUT',
      }
    );

    expect(validateSameOriginMutation(request)).toBeNull();
  });

  it('uses the first forwarded host and proto values for proxied origin checks', () => {
    const request = new Request(
      'http://internal-web-service/api/v1/mobile-deployment',
      {
        headers: {
          [MOBILE_DEPLOYMENT_CSRF_HEADER]: '1',
          origin: 'https://tuturuuu.com',
          'x-forwarded-host': 'tuturuuu.com, internal-web-service',
          'x-forwarded-proto': 'https, http',
        },
        method: 'PUT',
      }
    );

    expect(validateSameOriginMutation(request)).toBeNull();
  });

  it('allows admins with the mobile deployment vault permission', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: (permission: string) =>
        permission !== 'manage_mobile_deployment_vault',
    });

    const access = await authorizeMobileDeploymentAdmin(mutationRequest());

    expect(access.ok).toBe(true);
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
  });

  it('rejects root secret managers without the mobile deployment vault permission', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: (permission: string) =>
        permission === 'manage_mobile_deployment_vault',
    });

    const access = await authorizeMobileDeploymentAdmin(mutationRequest());

    expect(access.ok).toBe(false);
    if (!access.ok) {
      expect(access.response.status).toBe(403);
      await expect(access.response.json()).resolves.toMatchObject({
        code: 'mobile_deployment_forbidden',
      });
    }
  });

  it('rejects mutations without the dedicated action header', async () => {
    const response = validateSameOriginMutation(
      mutationRequest({ [MOBILE_DEPLOYMENT_CSRF_HEADER]: '0' })
    );

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      code: 'mobile_deployment_csrf_required',
    });
  });

  it('rejects explicit cross-origin mutations', async () => {
    const response = validateSameOriginMutation(
      mutationRequest({ origin: 'https://example.com' })
    );

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      code: 'mobile_deployment_origin_forbidden',
    });
  });

  it('rejects cross-origin mutations even when a forwarded public origin is present', async () => {
    const response = validateSameOriginMutation(
      mutationRequest({
        origin: 'https://example.com',
        'x-forwarded-host': 'tuturuuu.com',
        'x-forwarded-proto': 'https',
      })
    );

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      code: 'mobile_deployment_origin_forbidden',
    });
  });

  it('falls back to request URL origin when forwarded host is malformed', async () => {
    const response = validateSameOriginMutation(
      mutationRequest({
        origin: 'https://tuturuuu.com',
        'x-forwarded-host': 'not a host',
        'x-forwarded-proto': 'https',
      })
    );

    expect(response).toBeNull();

    const internalResponse = validateSameOriginMutation(
      new Request('https://internal-web-service/api/v1/mobile-deployment', {
        headers: {
          [MOBILE_DEPLOYMENT_CSRF_HEADER]: '1',
          origin: 'https://tuturuuu.com',
          'x-forwarded-host': 'not a host',
          'x-forwarded-proto': 'https',
        },
        method: 'PUT',
      })
    );

    expect(internalResponse?.status).toBe(403);
    await expect(internalResponse?.json()).resolves.toMatchObject({
      code: 'mobile_deployment_origin_forbidden',
    });
  });
});
