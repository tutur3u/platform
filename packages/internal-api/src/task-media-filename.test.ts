import { describe, expect, it } from 'vitest';
import { resolveTaskMediaUploadFilename } from './task-media-filename';

describe('resolveTaskMediaUploadFilename', () => {
  it.each([
    ['image/png', 'pasted-image.png'],
    ['image/jpeg', 'pasted-image.jpg'],
    ['image/webp', 'pasted-image.webp'],
    ['image/gif', 'pasted-image.gif'],
    ['image/avif', 'pasted-image.avif'],
  ])('names an unnamed %s clipboard image', (type, expected) => {
    expect(
      resolveTaskMediaUploadFilename(new File(['image'], '', { type }))
    ).toBe(expected);
  });

  it('adds an extension to an extensionless clipboard filename', () => {
    expect(
      resolveTaskMediaUploadFilename(
        new File(['image'], 'Screenshot', { type: 'image/png' })
      )
    ).toBe('Screenshot.png');
  });

  it('preserves an existing filename and extension', () => {
    expect(
      resolveTaskMediaUploadFilename(
        new File(['image'], 'capture.jpeg', { type: 'image/jpeg' })
      )
    ).toBe('capture.jpeg');
  });

  it('normalizes surrounding filename and content-type whitespace', () => {
    expect(
      resolveTaskMediaUploadFilename(
        new File(['image'], '  capture  ', { type: ' IMAGE/PNG ' })
      )
    ).toBe('capture.png');
  });

  it('returns a non-empty fallback when the clipboard omits both fields', () => {
    expect(resolveTaskMediaUploadFilename(new File(['image'], ''))).toBe(
      'pasted-image'
    );
  });
});
