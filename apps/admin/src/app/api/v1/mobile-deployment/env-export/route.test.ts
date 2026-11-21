import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  exportEnv: vi.fn(),
  validateOrigin: vi.fn(),
}));

vi.mock('@/lib/mobile-deployment/access', () => ({
  authorizeMobileDeploymentAdmin: mocks.authorize,
  validateSameOriginMutation: mocks.validateOrigin,
}));

vi.mock('@/lib/mobile-deployment/admin-env-export', () => ({
  exportActiveMobileDartDefines: mocks.exportEnv,
}));

vi.mock('@/lib/mobile-deployment/store', () => ({
  MobileDeploymentStoreError: class MobileDeploymentStoreError extends Error {
    constructor(
      message: string,
      public readonly status = 409,
      public readonly code = 'store_error'
    ) {
      super(message);
    }
  },
}));

import { POST } from './route';

function request() {
  return new Request('http://localhost/api/v1/mobile-deployment/env-export', {
    method: 'POST',
    headers: { origin: 'http://localhost' },
  });
}

describe('mobile Dart define export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateOrigin.mockReturnValue(null);
    mocks.authorize.mockResolvedValue({
      db: { service: 'db' },
      ok: true,
      userId: 'admin-1',
    });
    mocks.exportEnv.mockResolvedValue({
      environment: 'production',
      envFile: 'API_BASE_URL=https://tuturuuu.com\n',
      versionNumber: 3,
    });
  });

  it('requires same-origin action validation before vault access', async () => {
    mocks.validateOrigin.mockReturnValue(new Response(null, { status: 403 }));
    expect((await POST(request())).status).toBe(403);
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.exportEnv).not.toHaveBeenCalled();
  });

  it('does not read plaintext for a non-admin session', async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.exportEnv).not.toHaveBeenCalled();
  });

  it('exports only active Dart defines with no-store headers', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(await response.json()).toEqual({
      environment: 'production',
      envFile: 'API_BASE_URL=https://tuturuuu.com\n',
      versionNumber: 3,
    });
    expect(mocks.exportEnv).toHaveBeenCalledWith({
      db: { service: 'db' },
      userId: 'admin-1',
    });
  });
});
