import { describe, expect, it } from 'vitest';
import { buildMailMessagePreviewDocument } from './mail-message-preview-utils';

describe('buildMailMessagePreviewDocument', () => {
  it('constrains wide email content in original mode', () => {
    const document = buildMailMessagePreviewDocument(
      '<table style="width:1200px"><tr><td>Mail</td></tr></table>',
      'original'
    );

    expect(document).toContain('overflow-x:auto');
    expect(document).toContain("script-src 'none'");
    expect(document).toContain('table{max-width:100%}');
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

describe('newsletter fidelity', () => {
  it('keeps sender width, logo height and hidden preheader without leaking document titles', () => {
    const document = buildMailMessagePreviewDocument(
      '<html><head><title>Hidden title</title></head><body><div style="display:none;max-height:0;overflow:hidden">Preview</div><table align="center" style="max-width:37.5em"><tr><td><img height="48" src="https://example.com/logo.png" /></td></tr></table></body></html>',
      'original'
    );
    expect(document).not.toContain('Hidden title');
    expect(document).toContain('display:none;max-height:0;overflow:hidden');
    expect(document).toContain('max-width:37.5em');
    expect(document).toContain('height="48"');
    expect(document).not.toContain('height:auto!important');
    expect(document).not.toContain('max-width:100%!important');
  });
});
