import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sign: vi.fn(),
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

import { CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { POST } from './route';

const actor = '00000000-0000-4000-8000-000000000901';
const invoke = (filename = 'avatar.png') =>
  (
    POST as unknown as (request: Request, context: unknown) => Promise<Response>
  )(
    new Request('https://example.test/api/v1/users/me/avatar/upload-url', {
      method: 'POST',
      body: JSON.stringify({ filename }),
    }),
    { user: { id: actor } }
  );

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-02T12:00:00Z') });
  vi.clearAllMocks();
  mocks.budget.mockResolvedValue([1, 0]);
  mocks.sign.mockResolvedValue({
    data: {
      signedUrl: 'https://example.test/upload',
      token: 'synthetic-ticket',
    },
    error: null,
  });
  mocks.publicUrl.mockReturnValue({
    data: { publicUrl: 'https://example.test/avatar.png' },
  });
  mocks.admin.mockResolvedValue({
    storage: {
      from: vi.fn((bucket: string) => {
        expect(bucket).toBe('avatars');
        return {
          createSignedUploadUrl: mocks.sign,
          getPublicUrl: mocks.publicUrl,
        };
      }),
    },
  });
});

afterEach(() => vi.useRealTimers());

describe('budgeted current-user avatar tickets', () => {
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
    expect(body).toEqual({
      uploadUrl: 'https://example.test/upload',
      publicUrl: 'https://example.test/avatar.png',
      filePath: expect.stringMatching(new RegExp(`^${actor}/\\d+\\.png$`)),
      token: 'synthetic-ticket',
    });
    const dimensions = mocks.budget.mock.calls[0]![0];
    expect(dimensions).toHaveLength(7);
    expect(
      dimensions.map((dimension: unknown[]) => dimension[0]).join()
    ).not.toContain(actor);
    expect(dimensions[0].slice(1, 3)).toEqual([1, 2]);
    expect(dimensions[1].slice(1, 3)).toEqual([1, 3]);
    expect(dimensions[3].slice(1, 3)).toEqual([2097152, 16777216]);
    expect(mocks.budget.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.admin.mock.invocationCallOrder[0]!
    );
    expect(mocks.sign).toHaveBeenCalledWith(body.filePath, { upsert: false });
  });

  it('denies a depleted budget before opening an admin client or signing', async () => {
    mocks.budget.mockResolvedValue([0, 1]);
    expect((await invoke()).status).toBe(429);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it('fails closed when the authoritative budget is unavailable', async () => {
    mocks.budget.mockRejectedValue(new Error('Synthetic budget outage'));
    expect((await invoke()).status).toBe(503);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it.each(['avatar.svg', '../avatar.png'])(
    'rejects invalid file %s without reserving',
    async (filename) => {
      expect((await invoke(filename)).status).toBe(400);
      expect(mocks.budget).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    }
  );

  it('reports signing failures after keeping the already consumed reservation', async () => {
    mocks.sign.mockResolvedValue({
      data: null,
      error: { message: 'Synthetic signing failure' },
    });
    expect((await invoke()).status).toBe(500);
    expect(mocks.budget).toHaveBeenCalledTimes(1);
  });
});
