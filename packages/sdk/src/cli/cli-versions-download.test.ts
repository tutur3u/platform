import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { downloadVerifiedArchive } from './cli-versions-download';

const url = 'https://registry.test/archive.tgz';
const integrity = (bytes: string) =>
  `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
function options(response: Response, maxBytes = 8) {
  return {
    fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response),
    signal: new AbortController().signal,
    maxBytes,
  };
}

describe('bounded in-memory CLI downloads', () => {
  it('uses identity encoding and one signal while streaming authenticated bytes', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from('veri'));
          controller.enqueue(Buffer.from('fied'));
          controller.close();
        },
      })
    );
    const wholeBody = vi.spyOn(response, 'arrayBuffer');
    const config = options(response);
    expect(
      await downloadVerifiedArchive(url, integrity('verified'), config)
    ).toEqual(Buffer.from('verified'));
    expect(config.fetchImpl).toHaveBeenCalledWith(url, {
      redirect: 'error',
      signal: config.signal,
      headers: { 'accept-encoding': 'identity' },
    });
    expect(wholeBody).not.toHaveBeenCalled();
    expect(response.body?.locked).toBe(false);
  });

  it('rejects an oversized Content-Length before reading the body', async () => {
    const response = new Response('body', {
      headers: { 'content-length': '9' },
    });
    await expect(
      downloadVerifiedArchive(url, integrity('body'), options(response))
    ).rejects.toThrow(/size limit/u);
    expect(response.body?.locked).toBe(false);
  });

  it('enforces the decoded-byte memory cap with chunked input and no Content-Length', async () => {
    let pulls = 0;
    let cancelled = false;
    const response = new Response(
      new ReadableStream(
        {
          pull(controller) {
            controller.enqueue(Buffer.from(pulls++ === 0 ? 'abcd' : 'ef'));
          },
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 }
      )
    );
    expect(response.headers.has('content-length')).toBe(false);
    await expect(
      downloadVerifiedArchive(url, integrity('abcdef'), options(response, 5))
    ).rejects.toThrow(/size limit/u);
    expect(cancelled).toBe(true);
    expect(response.body?.locked).toBe(false);
  });

  it('does not return bytes until registry integrity matches', async () => {
    const response = new Response('tampered');
    await expect(
      downloadVerifiedArchive(url, integrity('original'), options(response))
    ).rejects.toThrow(/registry integrity check/u);
    expect(response.body?.locked).toBe(false);
  });
});
