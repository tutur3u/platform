// @vitest-environment node
import { createRequire } from 'node:module';
import DOMPurify from 'isomorphic-dompurify';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

describe('server email HTML DOMPurify compatibility', () => {
  it('retains unsubscribe document structure and form while rejecting executable content', () => {
    // The existing unsubscribe response uses WHOLE_DOCUMENT, not a fragment.
    const clean = DOMPurify.sanitize(
      '<html><head><title>Unsubscribe</title><style>p { color: black }</style></head>' +
        '<body><main><p>Stop email notifications</p>' +
        '<form method="post"><input name="token" value="test-token">' +
        '<button type="submit">Confirm</button></form></main>' +
        '<script>alert(1)</script><img onerror="alert(1)">' +
        '<a href="javascript:alert(1)">Unsafe</a></body></html>',
      { WHOLE_DOCUMENT: true }
    );
    const parsed = new JSDOM(clean);
    try {
      const document = parsed.window.document;
      expect(clean).toContain('<html>');
      expect(document.title).toBe('Unsubscribe');
      expect(document.querySelector('style')?.textContent).toContain(
        'color: black'
      );
      expect(document.querySelector('form')?.getAttribute('method')).toBe(
        'post'
      );
      expect(document.querySelector('input')?.getAttribute('value')).toBe(
        'test-token'
      );
      expect(document.querySelector('script, [onerror]')).toBeNull();
      expect(document.querySelector('a')?.hasAttribute('href')).toBe(false);
    } finally {
      parsed.window.close();
    }
  });

  it('preserves the CommonJS factory used by the isomorphic adapter', () => {
    const factory = require('dompurify');
    const window = new JSDOM('');
    try {
      expect(typeof factory).toBe('function');
      const purifier = factory(window.window);
      expect(purifier.sanitize('<b>Safe</b><script>alert(1)</script>')).toBe(
        '<b>Safe</b>'
      );
    } finally {
      window.window.close();
    }
  });
});
