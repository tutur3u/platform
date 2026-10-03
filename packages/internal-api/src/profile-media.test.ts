import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('./profile-media-optimize', () => ({
  optimizeProfileMediaFile: vi.fn(),
}));

import { optimizeProfileMediaFile } from './profile-media-optimize';

beforeEach(() =>
  vi.mocked(optimizeProfileMediaFile).mockImplementation(async (file) => file)
);

import type { InternalApiError } from './internal-api-error';
import {
  uploadCurrentUserProfileMedia,
  uploadWorkspaceUserAvatar,
} from './profile-media';
import { uploadUserProfileLinkAvatar } from './users';

it.each(['avatar', 'banner'] as const)(
  'uploads a supported %s through the budgeted API and saves no profile prematurely',
  async (kind) => {
    const file = new File(['synthetic'], 'art.png', { type: 'image/png' });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            uploadUrl: 'https://storage.test/signed',
            publicUrl: 'https://storage.test/public',
          })
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect(
      await uploadCurrentUserProfileMedia(kind, file, {
        baseUrl: 'https://app.test',
        fetch,
      })
    ).toBe('https://storage.test/public');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]![0]).toBe(
      `https://app.test/api/v1/users/me/${kind}/upload-url`
    );
    expect(fetch.mock.calls[1]).toEqual([
      'https://storage.test/signed',
      expect.objectContaining({ method: 'PUT', body: file }),
    ]);
  }
);
it.each([
  ['avatar', 'image/svg+xml', 1],
  ['avatar', 'image/png', 0],
  ['avatar', 'image/png', 2 * 1024 ** 2 + 1],
  ['banner', 'image/png', 5 * 1024 ** 2 + 1],
] as const)(
  'rejects invalid %s media before requesting tickets',
  async (kind, type, bytes) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(
      uploadCurrentUserProfileMedia(
        kind,
        new File([new Uint8Array(bytes)], 'art.png', { type }),
        { fetch }
      )
    ).rejects.toThrow('Invalid profile image');
    expect(fetch).not.toHaveBeenCalled();
  }
);
it('preserves quota errors and never starts a storage request after rejection', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        message: 'Quota reached',
        code: 'profile_upload_limit',
      }),
      { status: 429 }
    )
  );
  await expect(
    uploadCurrentUserProfileMedia(
      'avatar',
      new File(['x'], 'art.png', { type: 'image/png' }),
      { fetch }
    )
  ).rejects.toMatchObject<Partial<InternalApiError>>({
    status: 429,
    code: 'profile_upload_limit',
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('keeps API credentials on the ticket request and omits them from Storage', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          uploadUrl: 'https://storage.test/signed',
          publicUrl: 'https://storage.test/public',
        })
      )
    )
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  await uploadCurrentUserProfileMedia(
    'avatar',
    new File(['x'], 'art.png', { type: 'image/png' }),
    {
      baseUrl: 'https://app.test',
      fetch,
      defaultHeaders: {
        authorization: 'Bearer synthetic-api-auth',
        cookie: 'synthetic-session=value',
        'x-private-client': 'synthetic-private',
      },
    }
  );
  const apiHeaders = new Headers(fetch.mock.calls[0]![1]?.headers);
  expect(apiHeaders.get('authorization')).toBe('Bearer synthetic-api-auth');
  expect(apiHeaders.get('cookie')).toBe('synthetic-session=value');
  const storageRequest = fetch.mock.calls[1]![1]!;
  expect(storageRequest.credentials).toBe('omit');
  const storageHeaders = new Headers(storageRequest.headers);
  expect([...storageHeaders.entries()]).toEqual([
    ['content-type', 'image/png'],
  ]);
});

it.each(['contact', 'profile-link'] as const)(
  'optimizes %s avatars and omits API credentials from the capability PUT',
  async (surface) => {
    const optimized = new File(['optimized'], 'avatar.webp', {
      type: 'image/webp',
    });
    vi.mocked(optimizeProfileMediaFile).mockResolvedValue(optimized);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            signedUrl: 'https://upload.test/signed',
            publicUrl: 'https://public.test/avatar.webp',
          })
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const options = {
      baseUrl: 'https://app.test',
      fetch,
      defaultHeaders: { Authorization: 'Bearer synthetic-api-auth' },
    };
    const file = new File(['source'], 'source.png', { type: 'image/png' });
    if (surface === 'contact')
      await uploadWorkspaceUserAvatar('workspace-id', file, options);
    else await uploadUserProfileLinkAvatar('active-link', file, options);
    expect(vi.mocked(optimizeProfileMediaFile)).toHaveBeenCalledWith(
      file,
      'avatar'
    );
    expect(fetch.mock.calls[1]![1]).toMatchObject({
      credentials: 'omit',
      method: 'PUT',
      body: optimized,
    });
    expect([
      ...new Headers(fetch.mock.calls[1]![1]!.headers).entries(),
    ]).toEqual([['content-type', 'image/webp']]);
  }
);
