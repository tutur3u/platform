import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  admin: vi.fn(),
  reserve: vi.fn(),
  sign: vi.fn(),
  bucket: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: f.admin,
}));
vi.mock('@tuturuuu/storage-core/profile-upload-budget', async () => {
  class ProfileUploadError extends Error {
    constructor(
      message: string,
      public status: number,
      public retryAfter?: number
    ) {
      super(message);
    }
  }
  return { ProfileUploadError, reserveProfileUploadBudget: f.reserve };
});
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (req: Request, context: unknown) => unknown) => (req: Request) =>
      handler(req, { user: { id: 'resolved-actor' } }),
}));

import { ProfileUploadError } from '@tuturuuu/storage-core/profile-upload-budget';
import { createProfileMediaUploadHandler } from './profile-media-upload';

const request = (body: unknown) =>
  new Request('https://example.test/api/v1/users/me/avatar/upload-url', {
    method: 'POST',
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  f.reserve.mockResolvedValue(undefined);
  f.bucket.mockReturnValue({
    createSignedUploadUrl: f.sign,
    getPublicUrl: (path: string) => ({
      data: { publicUrl: `https://storage.test/${path}` },
    }),
  });
  f.admin.mockResolvedValue({ storage: { from: f.bucket } });
  f.sign.mockResolvedValue({
    data: {
      signedUrl: 'https://storage.test/signed',
      token: 'synthetic-token',
    },
    error: null,
  });
});
it.each(['avatar', 'banner'] as const)(
  'signs only an actor-scoped %s path after its shared reservation',
  async (kind) => {
    const response = await createProfileMediaUploadHandler(kind)(
      request({ filename: 'art.png', userId: 'forged' }),
      undefined as never
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(f.reserve).toHaveBeenCalledWith('resolved-actor', kind);
    expect(f.admin).toHaveBeenCalledWith({ noCookie: true });
    expect(f.bucket).toHaveBeenCalledWith(
      kind === 'avatar' ? 'avatars' : 'banners'
    );
    expect(f.sign).toHaveBeenCalledWith(
      expect.stringMatching(/^resolved-actor\/[0-9a-f-]+\.png$/),
      { upsert: false }
    );
    expect(f.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      f.sign.mock.invocationCallOrder[0]!
    );
  }
);
it.each(['../art.png', 'art.svg', 'art.exe', `${'a'.repeat(201)}.png`])(
  'rejects invalid filenames %s before reserving or signing',
  async (filename) => {
    expect(
      (
        await createProfileMediaUploadHandler('avatar')(
          request({ filename }),
          undefined as never
        )
      ).status
    ).toBe(400);
    expect(f.reserve).not.toHaveBeenCalled();
    expect(f.sign).not.toHaveBeenCalled();
  }
);
it.each([429, 503])(
  'does not issue tickets when shared protection rejects with %s',
  async (status) => {
    f.reserve.mockRejectedValue(
      new ProfileUploadError(
        'Unavailable',
        status,
        status === 429 ? 3600 : undefined
      )
    );
    const response = await createProfileMediaUploadHandler('banner')(
      request({ filename: 'art.webp' }),
      undefined as never
    );
    expect(response.status).toBe(status);
    expect(f.sign).not.toHaveBeenCalled();
    if (status === 429)
      expect(response.headers.get('Retry-After')).toBe('3600');
  }
);

it('uses a configured HTTPS public Storage origin while preserving scoped signed tokens', async () => {
  vi.stubEnv(
    'SUPABASE_PUBLIC_STORAGE_ORIGIN',
    'https://supabase.tuturuuu.localhost:1355'
  );
  f.sign.mockResolvedValue({
    data: {
      signedUrl:
        'http://internal:8001/storage/v1/object/upload/sign/avatars/actor/art.png?token=synthetic',
      token: 'synthetic',
    },
    error: null,
  });
  const response = await createProfileMediaUploadHandler('avatar')(
    request({ filename: 'art.png' }),
    undefined as never
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    uploadUrl:
      'https://supabase.tuturuuu.localhost:1355/storage/v1/object/upload/sign/avatars/actor/art.png?token=synthetic',
  });
});
it('does not return insecure or malformed public Storage endpoints', async () => {
  vi.stubEnv('SUPABASE_PUBLIC_STORAGE_ORIGIN', 'http://untrusted.test');
  expect(
    (
      await createProfileMediaUploadHandler('avatar')(
        request({ filename: 'art.png' }),
        undefined as never
      )
    ).status
  ).toBe(503);
});
