// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { createAppCoordinationToken } from '@tuturuuu/utils/app-coordination-token';
import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  consume: vi.fn(),
  admin: vi.fn(),
  upload: vi.fn(),
  optimize: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: f.admin,
}));
vi.mock('@tuturuuu/storage-core/profile-upload-budget', () => ({
  consumeProfileUploadTicket: f.consume,
  PROFILE_MEDIA_MAX_BYTES: { avatar: 2 * 1024 ** 2, banner: 5 * 1024 ** 2 },
  ProfileUploadError: class extends Error {
    constructor(
      message: string,
      public status: number
    ) {
      super(message);
    }
  },
}));
vi.mock('./profile-media-optimize', () => ({
  optimizeProfileMedia: f.optimize,
}));
vi.mock('./profile-media-public-url', () => ({
  publicStorageUrl: (url: string) => url,
}));

import { ProfileUploadError } from '@tuturuuu/storage-core/profile-upload-budget';
import { createProfileMediaPutHandler } from './profile-media-upload-put';

const actor = randomUUID();
const ticket = (
  kind = 'avatar',
  now?: Date,
  targetApp = 'profile-media-upload'
) =>
  createAppCoordinationToken(
    {
      userId: actor,
      targetApp,
      scopes: [`profile-media:${kind}`],
      expiresInSeconds: 600,
    },
    { now }
  );
const request = (
  token: string,
  bytes = Buffer.from('synthetic'),
  type = 'image/png'
) =>
  new Request(`https://app.test/api/v1/users/me/avatar/upload?token=${token}`, {
    method: 'PUT',
    headers: { 'Content-Type': type },
    body: bytes,
  });
beforeEach(() => {
  vi.clearAllMocks();
  f.consume.mockResolvedValue(undefined);
  f.optimize.mockResolvedValue(Buffer.from('optimized'));
  f.upload.mockResolvedValue({ error: null });
  f.admin.mockResolvedValue({
    rpc: f.rpc,
    storage: {
      from: () => ({
        upload: f.upload,
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://storage.test/${path}` },
        }),
      }),
    },
  });
});
it('accepts the signed mobile PUT without cookies, consumes once and stores only optimized WebP', async () => {
  const signed = ticket();
  const response = await createProfileMediaPutHandler('avatar')(
    request(signed.token)
  );
  expect(response.status).toBe(200);
  expect(f.consume).toHaveBeenCalledWith(signed.claims.jti);
  expect(f.upload).toHaveBeenCalledWith(
    `${actor}/${signed.claims.jti}.webp`,
    Buffer.from('optimized'),
    { contentType: 'image/webp', upsert: false, cacheControl: '31536000' }
  );
  expect(f.consume.mock.invocationCallOrder[0]).toBeLessThan(
    f.optimize.mock.invocationCallOrder[0]!
  );
});
it.each([
  () => ticket('banner').token,
  () => ticket('avatar', new Date('2000-01-01')).token,
  () => ticket('avatar', undefined, 'lettin').token,
  () => `${ticket().token}tamper`,
])(
  'rejects forged, expired, session or wrong-kind capabilities before CPU or Storage',
  async (getToken) => {
    expect(
      (await createProfileMediaPutHandler('avatar')(request(getToken()))).status
    ).toBe(401);
    expect(f.consume).not.toHaveBeenCalled();
    expect(f.optimize).not.toHaveBeenCalled();
    expect(f.upload).not.toHaveBeenCalled();
  }
);
it.each([409, 503])(
  'fails closed before decoding when consume rejects %s',
  async (status) => {
    f.consume.mockRejectedValue(new ProfileUploadError('Unavailable', status));
    expect(
      (await createProfileMediaPutHandler('avatar')(request(ticket().token)))
        .status
    ).toBe(status);
    expect(f.optimize).not.toHaveBeenCalled();
  }
);
it('bounds actual streamed input even without a length header', async () => {
  expect(
    (
      await createProfileMediaPutHandler('avatar')(
        request(ticket().token, Buffer.alloc(2 * 1024 ** 2 + 1))
      )
    ).status
  ).toBe(413);
  expect(f.optimize).not.toHaveBeenCalled();
});
it('never stores corrupt images or accepts forged MIME', async () => {
  f.optimize.mockRejectedValue(new ProfileUploadError('Invalid image', 400));
  expect(
    (await createProfileMediaPutHandler('avatar')(request(ticket().token)))
      .status
  ).toBe(400);
  expect(f.upload).not.toHaveBeenCalled();
  f.consume.mockClear();
  expect(
    (
      await createProfileMediaPutHandler('avatar')(
        request(ticket().token, Buffer.from('svg'), 'image/svg+xml')
      )
    ).status
  ).toBe(400);
  expect(f.consume).not.toHaveBeenCalled();
});

it('stores a workspace capability only in its signed workspace path', async () => {
  const workspace = randomUUID();
  const signed = createAppCoordinationToken({
    userId: actor,
    targetApp: 'profile-media-upload',
    scopes: ['profile-media:avatar', `workspace:${workspace}`],
    expiresInSeconds: 600,
  });
  expect(
    (await createProfileMediaPutHandler('avatar')(request(signed.token))).status
  ).toBe(200);
  expect(f.upload.mock.calls[0]![0]).toBe(
    `workspaces/${workspace}/avatar-${signed.claims.jti}.webp`
  );
});

it.each([
  '12345678-1234-1234-1234-123456789abc/users',
  '12345678-1234-1234-1234-123456789abc/users/profile-link/active-link',
])('stores managed avatars only in the signed prefix %s', async (prefix) => {
  const signed = createAppCoordinationToken({
    userId: actor,
    targetApp: 'profile-media-upload',
    scopes: ['profile-media:avatar', `avatar-prefix:${prefix}`],
    expiresInSeconds: 600,
  });
  expect(
    (await createProfileMediaPutHandler('avatar')(request(signed.token))).status
  ).toBe(200);
  expect(f.upload.mock.calls[0]![0]).toBe(
    `${prefix}/${signed.claims.jti}.webp`
  );
});
it('rejects traversal in a signed managed prefix', async () => {
  const signed = createAppCoordinationToken({
    userId: actor,
    targetApp: 'profile-media-upload',
    scopes: [
      'profile-media:avatar',
      'avatar-prefix:12345678-1234-1234-1234-123456789abc/users/../other',
    ],
    expiresInSeconds: 600,
  });
  expect(
    (await createProfileMediaPutHandler('avatar')(request(signed.token))).status
  ).toBe(401);
  expect(f.consume).not.toHaveBeenCalled();
});

it('binds banner capability to the issued immutable operation and stores optimized WebP there', async () => {
  const operation = randomUUID();
  const signed = createAppCoordinationToken({
    userId: actor,
    targetApp: 'profile-media-upload',
    scopes: ['profile-media:banner', `banner-operation:${operation}`],
    expiresInSeconds: 600,
  });
  f.rpc.mockResolvedValue({
    data: { state: 'issued', file_path: `${actor}/${operation}.webp` },
    error: null,
  });
  expect(
    (await createProfileMediaPutHandler('banner')(request(signed.token))).status
  ).toBe(200);
  expect(f.rpc).toHaveBeenCalledWith('profile_banner_operation_status', {
    p_user_id: actor,
    p_operation_id: operation,
  });
  expect(f.upload).toHaveBeenCalledWith(
    `${actor}/${operation}.webp`,
    Buffer.from('optimized'),
    { contentType: 'image/webp', upsert: false, cacheControl: '31536000' }
  );
  expect(f.rpc.mock.invocationCallOrder[0]).toBeLessThan(
    f.optimize.mock.invocationCallOrder[0]!
  );
});

it.each(['conflict', 'committed', 'reserved', 'wrong-path', 'outage'] as const)(
  'rejects banner %s before decoding or storage',
  async (state) => {
    const operation = randomUUID();
    const signed = createAppCoordinationToken({
      userId: actor,
      targetApp: 'profile-media-upload',
      scopes: ['profile-media:banner', `banner-operation:${operation}`],
      expiresInSeconds: 600,
    });
    f.rpc.mockResolvedValue({
      data: {
        state: state === 'wrong-path' ? 'issued' : state,
        file_path:
          state === 'wrong-path'
            ? 'other/forged.webp'
            : `${actor}/${operation}.webp`,
      },
      error: state === 'outage' ? { code: 'synthetic' } : null,
    });
    expect(
      (await createProfileMediaPutHandler('banner')(request(signed.token)))
        .status
    ).toBe(state === 'outage' ? 503 : 409);
    expect(f.optimize).not.toHaveBeenCalled();
    expect(f.upload).not.toHaveBeenCalled();
  }
);

it.each(['', 'banner-operation:../other', `workspace:${randomUUID()}`])(
  'rejects unmanaged banner scope %j before ticket consumption',
  async (scope) => {
    const signed = createAppCoordinationToken({
      userId: actor,
      targetApp: 'profile-media-upload',
      scopes: ['profile-media:banner', ...(scope ? [scope] : [])],
      expiresInSeconds: 600,
    });
    expect(
      (await createProfileMediaPutHandler('banner')(request(signed.token)))
        .status
    ).toBe(401);
    expect(f.consume).not.toHaveBeenCalled();
    expect(f.upload).not.toHaveBeenCalled();
  }
);

it.each([
  null,
  'issued',
  [],
  { state: 'issued' },
  { state: 'issued', file_path: null },
  { state: 'issued', file_path: 123 },
])(
  'rejects malformed lifecycle receipts before decoding or storage: %j',
  async (data) => {
    const operation = randomUUID();
    const signed = createAppCoordinationToken({
      userId: actor,
      targetApp: 'profile-media-upload',
      scopes: ['profile-media:banner', `banner-operation:${operation}`],
      expiresInSeconds: 600,
    });
    f.rpc.mockResolvedValue({ data, error: null });
    expect(
      (await createProfileMediaPutHandler('banner')(request(signed.token)))
        .status
    ).toBe(409);
    expect(f.optimize).not.toHaveBeenCalled();
    expect(f.upload).not.toHaveBeenCalled();
  }
);
