import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPreviewText,
  isTextTooLargeToPreview,
  PreviewTooLargeError,
  TEXT_PREVIEW_MAX_BYTES,
} from './drive-preview-text';

describe('text preview cap', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('skips files the listing already reports as too large', () => {
    expect(
      isTextTooLargeToPreview({
        name: 'log.txt',
        metadata: { size: TEXT_PREVIEW_MAX_BYTES + 1 },
      })
    ).toBe(true);
    expect(
      isTextTooLargeToPreview({ name: 'a.txt', metadata: { size: 10 } })
    ).toBe(false);
    expect(isTextTooLargeToPreview({ name: 'a.txt' })).toBe(false);
  });

  it('stops before reading a body the server declares too large', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('x', {
          headers: { 'content-length': String(TEXT_PREVIEW_MAX_BYTES + 1) },
        })
      )
    );
    await expect(fetchPreviewText('https://r2.test/a')).rejects.toBeInstanceOf(
      PreviewTooLargeError
    );
  });

  it('stops reading a body without a declared length at the cap', async () => {
    const chunk = new Uint8Array(256 * 1024);
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(chunk);
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    await expect(fetchPreviewText('https://r2.test/a')).rejects.toBeInstanceOf(
      PreviewTooLargeError
    );
    expect(pulls).toBeLessThan(10);
  });

  it('returns small text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('hello')));
    await expect(fetchPreviewText('https://r2.test/a')).resolves.toBe('hello');
  });
});
