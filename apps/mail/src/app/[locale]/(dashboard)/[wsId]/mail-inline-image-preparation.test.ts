// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAIL_INLINE_IMAGE_MAX_BYTES,
  prepareMailInlineImage,
} from './mail-inline-image-preparation';

const close = vi.fn();
const drawImage = vi.fn();
const bitmap = { width: 4000, height: 3000, close };
const decode = vi.fn(async () => bitmap);

beforeEach(() => {
  vi.stubGlobal('createImageBitmap', decode);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('inline image upload preparation', () => {
  it('keeps a small PNG byte-for-byte without encoding', async () => {
    const file = new File(['png'], 'diagram.png', { type: 'image/png' });
    expect(await prepareMailInlineImage(file)).toBe(file);
    expect(decode).not.toHaveBeenCalled();
  });

  it('prepares a pasted PNG over 5 MiB inside the multipart upload budget', async () => {
    const file = new File([new Uint8Array(6 * 1024 * 1024)], 'image.png', {
      type: 'image/png',
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) => callback(new Blob([new Uint8Array(400 * 1024)], { type: 'image/webp' }))
    );
    const prepared = await prepareMailInlineImage(file);
    expect(file.size).toBeGreaterThan(5 * 1024 * 1024);
    expect(prepared.size).toBeLessThanOrEqual(MAIL_INLINE_IMAGE_MAX_BYTES);
    expect(prepared.type).toBe('image/webp');
    expect(prepared.name).toBe('image.webp');
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1800, 1350);
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects an image that cannot fit after bounded encoding attempts', async () => {
    const file = new File([new Uint8Array(6 * 1024 * 1024)], 'image.png', {
      type: 'image/png',
    });
    const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) => callback(new Blob([new Uint8Array(500 * 1024)], { type: 'image/webp' }))
    );
    await expect(prepareMailInlineImage(file)).rejects.toMatchObject({
      code: 'image_prepare_too_large',
    });
    expect(encode.mock.calls.length).toBeLessThanOrEqual(12);
    expect(close).toHaveBeenCalledOnce();
  });

  it('reports decode and encoder failures without returning oversized bytes', async () => {
    const file = new File([new Uint8Array(1024 * 1024)], 'image.png', {
      type: 'image/png',
    });
    decode.mockRejectedValueOnce(new Error('Unsupported image'));
    await expect(prepareMailInlineImage(file)).rejects.toMatchObject({
      code: 'image_prepare_failed',
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null));
    await expect(prepareMailInlineImage(file)).rejects.toMatchObject({
      code: 'image_prepare_failed',
    });
  });

  it('does not flatten a large animated GIF into a still image', async () => {
    const file = new File([new Uint8Array(1024 * 1024)], 'animation.gif', {
      type: 'image/gif',
    });
    await expect(prepareMailInlineImage(file)).rejects.toMatchObject({
      code: 'image_prepare_too_large',
    });
    expect(decode).not.toHaveBeenCalled();
  });

  it('honors cancellation before decoding or returning a prepared file', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(prepareMailInlineImage(new File(['x'], 'image.png'), controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(decode).not.toHaveBeenCalled();
  });
});
