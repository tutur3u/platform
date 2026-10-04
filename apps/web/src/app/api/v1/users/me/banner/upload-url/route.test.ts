import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sign: vi.fn(),
  rpc: vi.fn(),
  info: vi.fn(),
  publicUrl: vi.fn(),
  admin: vi.fn(),
  budget: vi.fn(),
  authOptions: undefined as unknown,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: mocks.admin,
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/storage-core/security-budget', () => ({
  reserveSecurityBudget: mocks.budget,
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown, options: unknown) => {
    mocks.authOptions = options;
    return handler;
  },
}));

import { verifyAppCoordinationToken } from '@tuturuuu/utils/app-coordination-token';
import { CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { POST } from './route';

const actor = '00000000-0000-4000-8000-000000000901';
const invoke = (filename = 'banner.png') =>
  (
    POST as unknown as (request: Request, context: unknown) => Promise<Response>
  )(
    new Request('https://example.test/api/v1/users/me/banner/upload-url', {
      method: 'POST',
      body: JSON.stringify({ filename }),
    }),
    { user: { id: actor } }
  );

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-02T12:00:00Z') });
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
  mocks.rpc.mockImplementation(async (name: string) => ({
    data:
      name === 'claim_profile_banner_upload'
        ? { state: 'reserved', claimed: true }
        : name === 'record_profile_banner_ticket'
          ? true
          : null,
    error: null,
  }));
  mocks.info.mockResolvedValue({ data: null, error: { statusCode: '404' } });
  mocks.budget.mockResolvedValue([1, 0]);
  mocks.sign.mockResolvedValue({
    data: {
      signedUrl: 'https://example.test/upload',
      token: expect.any(String),
    },
    error: null,
  });
  mocks.publicUrl.mockReturnValue({
    data: { publicUrl: 'https://example.test/banner.png' },
  });
  mocks.admin.mockResolvedValue({
    rpc: mocks.rpc,
    storage: {
      from: vi.fn((bucket: string) => {
        expect(bucket).toBe('banners');
        return {
          createSignedUploadUrl: mocks.sign,
          info: mocks.info,
          getPublicUrl: mocks.publicUrl,
        };
      }),
    },
  });
});

afterEach(() => vi.useRealTimers());

describe('budgeted current-user banner tickets', () => {
  it('preserves profile-write app-session auth and existing throttle', () => {
    expect(mocks.authOptions).toEqual({
      allowAppSessionAuth: CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH,
      rateLimit: { windowMs: 60000, maxRequests: 10 },
      skipAppSessionStepUpChallenge: true,
    });
  });

  it('issues an admin ticket for the resolved actor only after reserving worst-case bytes', async () => {
    const response = await invoke();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toEqual({
      uploadUrl: expect.stringContaining(
        '/api/v1/users/me/banner/upload?token='
      ),
      operationId: expect.any(String),
      publicUrl: expect.stringContaining(
        `https://storage.example.test/storage/v1/object/public/banners/${actor}/`
      ),
      filePath: expect.stringContaining(`${actor}/`),
      token: expect.any(String),
    });
    const dimensions = mocks.budget.mock.calls[0]![0];
    expect(dimensions).toHaveLength(7);
    expect(
      dimensions.map((dimension: unknown[]) => dimension[0]).join()
    ).not.toContain(actor);
    expect(dimensions[0].slice(1, 3)).toEqual([1, 2]);
    expect(dimensions[1].slice(1, 3)).toEqual([1, 2]);
    expect(dimensions[3].slice(1, 3)).toEqual([5242880, 16777216]);
    expect(mocks.budget.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.rpc.mock.invocationCallOrder.at(-1)!
    );
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(body.filePath).toBe(`${actor}/${body.operationId}.webp`);
    const verified = verifyAppCoordinationToken(body.token);
    expect(verified.ok).toBe(true);
    if (verified.ok)
      expect(verified.claims.scopes).toEqual([
        'profile-media:banner',
        `banner-operation:${body.operationId}`,
      ]);
  });

  it('denies a depleted budget before opening an admin client or signing', async () => {
    mocks.budget.mockResolvedValue([0, 1]);
    expect((await invoke()).status).toBe(429);
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it('fails closed when the authoritative budget is unavailable', async () => {
    mocks.budget.mockRejectedValue(new Error('Synthetic budget outage'));
    expect((await invoke()).status).toBe(503);
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it.each(['banner.svg', '../banner.png'])(
    'rejects invalid file %s without reserving',
    async (filename) => {
      expect((await invoke(filename)).status).toBe(400);
      expect(mocks.budget).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    }
  );

  it('classifies malformed JSON as 400 without reserving or signing', async () => {
    const response = await (
      POST as unknown as (req: Request, ctx: unknown) => Promise<Response>
    )(new Request('https://example.test', { method: 'POST', body: '{' }), {
      user: { id: actor },
    });
    expect(response.status).toBe(400);
    expect(mocks.budget).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('never returns a token after the operation was retired during signing', async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({
      data:
        name === 'claim_profile_banner_upload'
          ? { state: 'issued', claimed: false }
          : false,
      error: null,
    }));
    expect((await invoke()).status).toBe(409);
    expect(mocks.budget).not.toHaveBeenCalled();
  });

  it('does not charge a second budget unit when reissuing an issued operation capability', async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({
      data:
        name === 'claim_profile_banner_upload'
          ? { state: 'issued', claimed: false }
          : true,
      error: null,
    }));
    expect((await invoke()).status).toBe(200);
    expect(mocks.budget).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('reuses an already uploaded immutable slot without another budget or capability', async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === 'claim_profile_banner_upload' ? { state: 'issued' } : true,
      error: null,
    }));
    mocks.info.mockResolvedValue({
      data: { size: 1, contentType: 'image/webp' },
      error: null,
    });
    const response = await invoke('original.jpg');
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.uploaded).toBe(true);
    expect(body.filePath).toBe(`${actor}/${body.operationId}.webp`);
    expect(body.uploadUrl).toBeUndefined();
    expect(mocks.budget).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
