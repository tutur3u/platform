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

  it('returns small text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('hello')));
    await expect(fetchPreviewText('https://r2.test/a')).resolves.toBe('hello');
  });
});
