import { describe, expect, it } from 'vitest';
import { buildMailMessagePreviewDocument } from './mail-message-preview-utils';

describe('buildMailMessagePreviewDocument', () => {
  it('constrains wide email content in original mode', () => {
    const document = buildMailMessagePreviewDocument(
      '<table style="width:1200px"><tr><td>Mail</td></tr></table>',
      'original'
    );

    expect(document).toContain('overflow-x:hidden');
    expect(document).toContain('table{max-width:100%!important');
    expect(document).toContain('color-scheme:light');
  });

  it('adds an immersive dark palette without inverting images', () => {
    const document = buildMailMessagePreviewDocument(
      '<img src="https://example.com/logo.png">',
      'dark'
    );

    expect(document).toContain('color-scheme:dark');
    expect(document).toContain('background:#121212');
    expect(document).not.toContain('filter:invert');
  });

  it('removes executable markup defensively', () => {
    const document = buildMailMessagePreviewDocument(
      '<script>alert(1)</script><p onclick="alert(2)">Hello</p>',
      'original'
    );

    expect(document).not.toContain('<script>');
    expect(document).not.toContain('onclick=');
  });
});
