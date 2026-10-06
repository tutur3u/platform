import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { DesktopMutationSchema, readDesktopBody } from './request';

describe('bounded desktop input', () => {
  it('rejects malformed actions and arbitrary fields rather than silently stripping them', () => {
    expect(
      DesktopMutationSchema.safeParse({
        action: 'create_version',
        platform: 'linux',
      }).success
    ).toBe(false);
    expect(
      DesktopMutationSchema.safeParse({
        action: 'create_version',
        platform: 'windows',
        enabled: true,
      }).success
    ).toBe(false);
  });
  it('requires a safe integer expected revision and valid version identity', () => {
    for (const revision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1])
      expect(
        DesktopMutationSchema.safeParse({
          action: 'activate',
          versionId: '00000000-0000-4000-8000-000000000001',
          revision,
        }).success
      ).toBe(false);
  });
  it('collects a valid streamed body without zeroing the returned copy', async () => {
    const result = await readDesktopBody(
      new Request('https://infra.example', {
        method: 'POST',
        body: 'safe fixture',
      }),
      20
    );
    expect(result.toString()).toBe('safe fixture');
  });
  it('rejects actual bytes despite a lying Content-Length', async () => {
    const req = new Request('https://infra.example', {
      method: 'POST',
      body: 'oversized fixture',
      headers: { 'content-length': '1' },
    });
    await expect(readDesktopBody(req, 3)).rejects.toMatchObject({
      status: 413,
      code: 'desktop_request_too_large',
    });
  });
  it('cancels a chunked upload after its bound is exceeded', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('12345'));
      },
      cancel,
    });
    const req = new Request('https://infra.example', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit);
    await expect(readDesktopBody(req, 4)).rejects.toMatchObject({
      status: 413,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
