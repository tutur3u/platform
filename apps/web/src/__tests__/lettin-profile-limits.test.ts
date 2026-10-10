import type { APIRequestContext } from '@playwright/test';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { assertLettinProfileLimits } from '../../e2e/helpers/lettin-profile-limits';

function response(status: number, payload: unknown = {}, bytes?: Buffer) {
  return {
    status: () => status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    headers: () => ({ 'retry-after': '60' }),
    body: async () => bytes,
  };
}

async function fixture(denialCode: string) {
  const image = await sharp({
    create: {
      width: 512,
      height: 256,
      channels: 4,
      background: { r: 20, g: 30, b: 40, alpha: 0.5 },
    },
  })
    .webp()
    .toBuffer();
  const post = vi
    .fn()
    .mockResolvedValueOnce(
      response(200, {
        filePath: 'synthetic-actor/avatar.webp',
        uploadUrl: 'https://synthetic.test/upload',
        publicUrl: 'https://synthetic.test/avatar.webp',
      })
    )
    .mockResolvedValueOnce(response(429, { code: denialCode }));
  const put = vi
    .fn()
    .mockResolvedValueOnce(response(200))
    .mockResolvedValueOnce(response(409));
  const get = vi
    .fn()
    .mockResolvedValueOnce(response(200, {}, image))
    .mockResolvedValueOnce(
      response(200, { display_name: 'Second synthetic name' })
    );
  const patch = vi.fn();
  for (const status of [400, 400, 400, 400, 429, 200, 429]) {
    patch.mockResolvedValueOnce(response(status));
  }
  const request = { post, put, get, patch };
  const onTicket = vi.fn();
  const options = vi.fn(() => ({
    headers: { authorization: 'Bearer synthetic-session' },
    maxRedirects: 0,
  }));
  const run = () =>
    assertLettinProfileLimits(
      request as unknown as APIRequestContext,
      'https://synthetic.test',
      'synthetic_actor',
      options,
      onTicket
    );
  return { run, post, put, get, patch, onTicket, options };
}

describe('Lettin profile-limit verification', () => {
  it('verifies upload-budget denial and retains profile-limit checks', async () => {
    const context = await fixture('profile_upload_limit');
    await context.run();
    expect(context.post).toHaveBeenCalledTimes(2);
    expect(context.put).toHaveBeenCalledTimes(2);
    expect(context.get).toHaveBeenCalledTimes(2);
    expect(context.patch).toHaveBeenCalledTimes(7);
    expect(context.onTicket).toHaveBeenCalledWith({
      bucket: 'avatars',
      path: 'synthetic-actor/avatar.webp',
    });
    expect(context.post.mock.invocationCallOrder[1]).toBeLessThan(
      context.patch.mock.invocationCallOrder[0]!
    );
  });

  it('rejects a session throttle instead of accepting it as upload-budget proof', async () => {
    const context = await fixture('RATE_LIMIT_EXCEEDED');
    await expect(context.run()).rejects.toThrow();
    expect(context.patch).not.toHaveBeenCalled();
    expect(context.onTicket).toHaveBeenCalledTimes(1);
  });
});
