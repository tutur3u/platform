import { beforeEach, expect, it, vi } from 'vitest';
import {
  removeCurrentUserBanner,
  uploadCurrentUserBanner,
} from './profile-banner';
import { optimizeProfileMediaFile } from './profile-media-optimize';

vi.mock('./profile-media-optimize', () => ({
  optimizeProfileMediaFile: vi.fn(),
}));
beforeEach(() =>
  vi.mocked(optimizeProfileMediaFile).mockImplementation(async (file) => file)
);
const operationId = '11111111-1111-4111-8111-111111111111';
const file = () => new File(['synthetic'], 'banner.png', { type: 'image/png' });
const options = (fetch: typeof globalThis.fetch) => ({
  baseUrl: 'https://app.test',
  fetch,
});
const ticket = (extra = {}) =>
  new Response(
    JSON.stringify({
      operationId,
      publicUrl: 'https://cdn.test/banner.webp',
      uploadUrl: 'https://app.test/signed',
      ...extra,
    })
  );

it('finalizes only after successful credential-free capability upload', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(ticket())
    .mockResolvedValueOnce(new Response('{}'))
    .mockResolvedValueOnce(new Response('{}'));
  await expect(
    uploadCurrentUserBanner(file(), operationId, options(fetch))
  ).resolves.toEqual({ publicUrl: 'https://cdn.test/banner.webp' });
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
    filename: 'banner.png',
    operationId,
  });
  expect(fetch.mock.calls[1]?.[1]).toMatchObject({
    method: 'PUT',
    credentials: 'omit',
  });
  expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toEqual({
    action: 'finalize',
    operationId,
  });
});
it.each([401, 409, 503])(
  'does not finalize a failed %s upload',
  async (status) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(ticket())
      .mockResolvedValueOnce(new Response('{}', { status }));
    await expect(
      uploadCurrentUserBanner(file(), operationId, options(fetch))
    ).rejects.toThrow('Unable to upload banner');
    expect(fetch).toHaveBeenCalledTimes(2);
  }
);
it('recovers a lost upload response without uploading again', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(ticket({ uploaded: true }))
    .mockResolvedValueOnce(new Response('{}'));
  await uploadCurrentUserBanner(file(), operationId, options(fetch));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1]?.[1]?.method).toBe('POST');
});
it('accepts an already committed receipt without another finalize', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(ticket({ committed: true }));
  await uploadCurrentUserBanner(file(), operationId, options(fetch));
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('rejects a different operation receipt before writing', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(ticket({ operationId: 'different' }));
  await expect(
    uploadCurrentUserBanner(file(), operationId, options(fetch))
  ).rejects.toThrow('Invalid banner upload receipt');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('removes through lifecycle rather than patching or deleting raw storage', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response('{}'));
  await removeCurrentUserBanner(operationId, options(fetch));
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
    action: 'remove',
    operationId,
  });
});
