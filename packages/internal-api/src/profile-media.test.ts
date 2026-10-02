import { expect, it, vi } from 'vitest';
import type { InternalApiError } from './internal-api-error';
import { uploadCurrentUserProfileMedia } from './profile-media';

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
