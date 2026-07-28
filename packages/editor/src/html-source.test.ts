// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { inspectRichTextHTML } from './html-source.js';

const stylePolicy = {
  alignments: ['left', 'center', 'right'] as const,
  highlights: [{ label: 'Warm', value: 'var(--brand-highlight)' }],
  textTones: [{ label: 'Gold', value: 'var(--brand-gold)' }],
};

describe('safe HTML source projection', () => {
  it('accepts semantic branded HTML and safe PNG images', () => {
    const result = inspectRichTextHTML(
      '<h2 style="text-align: center"><span style="color: var(--brand-gold)">Story</span></h2><img src="https://example.com/cover.png" alt="Cover">',
      document,
      { featurePreset: 'full', stylePolicy }
    );

    expect(result.unsafe).toBe(false);
    expect(result.html).toContain('text-align: center');
    expect(result.html).toContain('var(--brand-gold)');
    expect(result.html).toContain('cover.png');
  });

  it('preserves and normalizes numeric ordered-list starts', () => {
    const preserved = inspectRichTextHTML(
      '<ol start="03"><li>Third</li></ol>',
      document,
      { featurePreset: 'full', stylePolicy }
    );
    const normalized = inspectRichTextHTML(
      '<ol start="not-a-number"><li>First</li></ol>',
      document,
      { featurePreset: 'full', stylePolicy }
    );

    expect(preserved).toMatchObject({ normalized: true, unsafe: false });
    expect(preserved.html).toBe('<ol start="3"><li>Third</li></ol>');
    expect(normalized).toMatchObject({ normalized: true, unsafe: false });
    expect(normalized.html).toBe('<ol><li>First</li></ol>');
  });

  it.each([
    '<script>alert(1)</script>',
    '<p onclick="alert(1)">Unsafe</p>',
    '<h1 onclick="alert(1)">Unsafe normalized heading</h1>',
    '<section onclick="alert(1)">Unsafe wrapper</section>',
    '<section style="display:grid">Unsafe styled wrapper</section>',
    '<a href="javascript:alert(1)">Unsafe</a>',
    '<iframe src="https://example.com"></iframe>',
    '<p class="custom-grid">Unsafe class</p>',
    '<p style="display:grid">Unsafe layout</p>',
    '<span style="color: hotpink">Unapproved color</span>',
  ])('rejects unsafe source: %s', (source) => {
    expect(
      inspectRichTextHTML(source, document, {
        featurePreset: 'full',
        stylePolicy,
      }).unsafe
    ).toBe(true);
  });

  it('normalizes harmless aliases and unsupported wrappers', () => {
    const result = inspectRichTextHTML(
      '<section><b>Bold</b> <i>italic</i></section>',
      document,
      { featurePreset: 'full', stylePolicy }
    );

    expect(result).toMatchObject({ normalized: true, unsafe: false });
    expect(result.html).toBe('<p><strong>Bold</strong> <em>italic</em></p>');
  });

  it('strips comments and reports normalization', () => {
    const result = inspectRichTextHTML(
      '<p>Text<!-- private note --></p>',
      document,
      { featurePreset: 'full', stylePolicy }
    );

    expect(result).toMatchObject({ normalized: true, unsafe: false });
    expect(result.html).toBe('<p>Text</p>');
  });

  it('rejects blocked tags nested inside unsupported wrappers', () => {
    expect(
      inspectRichTextHTML(
        '<section><div><script>alert(1)</script></div></section>',
        document,
        { featurePreset: 'full', stylePolicy }
      ).unsafe
    ).toBe(true);
  });

  it('rejects unsafe image sources and fills missing alt text', () => {
    expect(
      inspectRichTextHTML('<img src="mailto:a@example.com">', document, {
        featurePreset: 'full',
        stylePolicy,
      }).unsafe
    ).toBe(true);
    expect(
      inspectRichTextHTML('<img src="https://example.com/a.png">', document, {
        featurePreset: 'full',
        stylePolicy,
      }).html
    ).toBe('<img src="https://example.com/a.png" alt="">');
  });

  it('normalizes full-only blocks in the compact preset', () => {
    const result = inspectRichTextHTML(
      '<h2>Biography</h2><ul><li>One</li></ul>',
      document,
      { featurePreset: 'compact', stylePolicy }
    );

    expect(result).toMatchObject({ normalized: true, unsafe: false });
    expect(result.html).not.toContain('<h2');
    expect(result.html).not.toContain('<ul');
  });

  it('preserves boundaries between unsupported block wrappers', () => {
    const result = inspectRichTextHTML(
      '<div>First</div><div>Second</div>',
      document,
      { featurePreset: 'compact', stylePolicy }
    );

    expect(result).toMatchObject({ normalized: true, unsafe: false });
    expect(result.html).toBe('<p>First</p><p>Second</p>');
  });

  it('preserves boundaries for definition-list and disclosure blocks', () => {
    const result = inspectRichTextHTML(
      '<dl><dt>Term</dt><dd>Definition</dd></dl><details><summary>More</summary><p>Details</p></details>',
      document,
      { featurePreset: 'compact', stylePolicy }
    );

    expect(result).toMatchObject({ normalized: true, unsafe: false });
    expect(result.html).toBe(
      '<p>Term</p><p>Definition</p><p>More</p><p>Details</p>'
    );
  });
});
