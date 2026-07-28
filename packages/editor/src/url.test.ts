import { describe, expect, it } from 'vitest';
import { normalizeRichTextImageUrl, normalizeRichTextUrl } from './url.js';

describe('normalizeRichTextUrl', () => {
  it.each([
    'https://example.com/story',
    'http://example.com',
    'mailto:editor@example.com',
    'tel:+84123456789',
    '/relative/path',
    '../relative/path',
    '?preview=true',
    '#section',
    '//cdn.example.com/image.jpg',
  ])('allows safe URL %s', (url) => {
    expect(normalizeRichTextUrl(url)).toBe(url);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'ftp://example.com/file',
    'not a url',
    'java\u0000script:alert(1)',
    'https://example.com/\u007fhidden',
  ])('rejects unsafe or malformed URL %s', (url) => {
    expect(normalizeRichTextUrl(url)).toBeNull();
  });

  it('trims safe URLs and preserves an intentionally empty value', () => {
    expect(normalizeRichTextUrl('  https://example.com  ')).toBe(
      'https://example.com'
    );
    expect(normalizeRichTextUrl('   ')).toBe('');
    expect(normalizeRichTextUrl(null)).toBe('');
  });

  it('percent-encodes whitespace in safe absolute and relative URLs', () => {
    expect(normalizeRichTextUrl('https://example.com/a b')).toBe(
      'https://example.com/a%20b'
    );
    expect(normalizeRichTextUrl('/stories/a b')).toBe('/stories/a%20b');
  });
});

describe('normalizeRichTextImageUrl', () => {
  it.each(['https://example.com/a.png', '/a.png', '//cdn.example.com/a.png'])(
    'allows image URL %s',
    (url) => {
      expect(normalizeRichTextImageUrl(url)).toBe(url);
    }
  );

  it.each(['mailto:a@example.com', 'tel:+84123456789', 'javascript:alert(1)'])(
    'rejects non-web image URL %s',
    (url) => {
      expect(normalizeRichTextImageUrl(url)).toBeNull();
    }
  );
});
