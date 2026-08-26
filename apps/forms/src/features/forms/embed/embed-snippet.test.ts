import { describe, expect, it } from 'vitest';
import {
  buildEmbedSnippet,
  buildIframeSnippet,
  buildShareUrl,
  isOverlayEmbedMode,
} from './embed-snippet';

const base = { baseUrl: 'https://forms.tuturuuu.com', shareCode: 'AbC123' };

describe('buildEmbedSnippet', () => {
  it('emits the script tag and container the SDK looks for', () => {
    const snippet = buildEmbedSnippet({ ...base, mode: 'inline' });

    expect(snippet).toContain(
      '<script src="https://forms.tuturuuu.com/embed.js" async></script>'
    );
    expect(snippet).toContain('data-tuturuuu-form="AbC123"');
    expect(snippet).toContain('data-mode="inline"');
  });

  it('omits height on overlay modes, which size themselves', () => {
    expect(
      buildEmbedSnippet({ ...base, mode: 'popup', height: 800 })
    ).not.toContain('data-height');
    expect(
      buildEmbedSnippet({ ...base, mode: 'inline', height: 800 })
    ).toContain('data-height="800"');
  });

  it('omits launcher text on modes with no launcher', () => {
    expect(
      buildEmbedSnippet({
        ...base,
        mode: 'popup',
        launcherText: 'Give feedback',
      })
    ).toContain('data-launcher-text="Give feedback"');
    expect(
      buildEmbedSnippet({
        ...base,
        mode: 'inline',
        launcherText: 'Give feedback',
      })
    ).not.toContain('data-launcher-text');
  });

  it('escapes values so a crafted label cannot break out of the attribute', () => {
    const snippet = buildEmbedSnippet({
      ...base,
      mode: 'popup',
      launcherText: '"><script>alert(1)</script>',
    });

    expect(snippet).not.toContain('"><script>alert(1)');
    expect(snippet).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('escapes the share code too', () => {
    const snippet = buildEmbedSnippet({
      baseUrl: base.baseUrl,
      shareCode: 'a"b',
      mode: 'inline',
    });

    expect(snippet).toContain('data-tuturuuu-form="a&quot;b"');
  });
});

describe('buildIframeSnippet', () => {
  it('falls back to a fixed height, since a bare iframe cannot auto-resize', () => {
    expect(buildIframeSnippet(base)).toContain('height="640"');
    expect(buildIframeSnippet({ ...base, height: 900 })).toContain(
      'height="900"'
    );
  });

  it('url-encodes the share code', () => {
    expect(buildIframeSnippet({ ...base, shareCode: 'a b/c' })).toContain(
      '/embed/a%20b%2Fc'
    );
  });
});

describe('buildShareUrl', () => {
  it('points at the canonical hosted page', () => {
    expect(buildShareUrl(base.baseUrl, base.shareCode)).toBe(
      'https://forms.tuturuuu.com/f/AbC123'
    );
  });
});

describe('isOverlayEmbedMode', () => {
  it.each(['popup', 'slider', 'popover', 'sidetab'] as const)(
    '%s is an overlay',
    (mode) => expect(isOverlayEmbedMode(mode)).toBe(true)
  );

  it.each(['inline', 'fullpage'] as const)('%s is not an overlay', (mode) =>
    expect(isOverlayEmbedMode(mode)).toBe(false)
  );
});
