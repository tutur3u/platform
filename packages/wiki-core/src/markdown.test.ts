import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hashWikiBody } from './body-hash';
import { parseWikiMarkdown, stringifyWikiMarkdown } from './markdown';
import { renderWikiHtml } from './render';

function fixture(name: string) {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('wiki Markdown', () => {
  it.each([
    'scheduling',
    'scheduling-api',
    'masonry-fields',
    'masonry-details',
    'workshop',
  ])('round-trips the %s excerpt', (name) => {
    const original = parseWikiMarkdown(fixture(`${name}.mdx`), {
      format: 'mdx',
    });
    const markdown = stringifyWikiMarkdown(original.body, original.frontmatter);
    expect(markdown).toBe(fixture(`${name}.md`));
    const decoded = parseWikiMarkdown(markdown);
    expect(decoded).toEqual(original);
    expect(hashWikiBody(decoded.body)).toEqual(hashWikiBody(original.body));
  });

  it('resolves docs links and images using the import inventory', () => {
    const src = '/images/sample.png';
    const asset = `/wiki/tuturuuu/_assets/${'a'.repeat(64)}`;
    const original = parseWikiMarkdown(
      `[Read more](/overview/vision)\n\n<img src="${src}" width={240} alt="Sample" />`,
      {
        format: 'mdx',
        resolveLink: (href) =>
          href === '/overview/vision'
            ? '/wiki/tuturuuu/overview/vision'
            : undefined,
        resolveAsset: (value) => (value === src ? asset : undefined),
      }
    );
    expect(renderWikiHtml(original.body)).toContain(
      `src="${asset}" alt="Sample" width="240"`
    );
    expect(parseWikiMarkdown(stringifyWikiMarkdown(original.body))).toEqual(
      original
    );
  });

  it('assigns duplicate heading slugs and retains explicit IDs', () => {
    const { body } = parseWikiMarkdown(
      '## Phân quyền\n\n## Phân quyền\n\n## Migration:anchor{#old-anchor}\n\n[Skip](#old-anchor)'
    );
    expect(body.content?.slice(0, 3).map((node) => node.attrs?.id)).toEqual([
      'phân-quyền',
      'phân-quyền-1',
      'old-anchor',
    ]);
    expect(renderWikiHtml(body)).toContain('href="#wiki-heading-old-anchor"');
    expect(parseWikiMarkdown(stringifyWikiMarkdown(body)).body).toEqual(body);
  });

  it('reserves explicit IDs before generating heading slugs', () => {
    const { body } = parseWikiMarkdown(
      '## Intro\n\n## !!!\n\n## ???\n\n## Original:anchor{#intro}\n\n## Reserved:anchor{#section}'
    );
    expect(body.content?.map((node) => node.attrs?.id)).toEqual([
      'intro-1',
      'section-1',
      'section-2',
      'intro',
      'section',
    ]);
    expect(parseWikiMarkdown(stringifyWikiMarkdown(body)).body).toEqual(body);
  });

  it('round-trips GFM tasks, reference links, nested marks and titled code', () => {
    const original = parseWikiMarkdown(
      [
        '- [x] Done',
        '- [ ] Read the [**guide** and details][page]. ~~Old~~',
        '',
        '[page]: /wiki/tuturuuu/guide "Guide"',
        '',
        '~~~ts title="Example"',
        'const n = 1;',
        '~~~',
      ].join('\n')
    );
    expect(parseWikiMarkdown(stringifyWikiMarkdown(original.body))).toEqual(
      original
    );
  });

  it('reads details shorthand and leaves fenced source intact', () => {
    const original = parseWikiMarkdown(
      [
        ':::details More & "FAQ"',
        '',
        '- First',
        '',
        ':::',
        '',
        '~~~markdown',
        ':::details Literal',
        '~~~',
      ].join('\n')
    );
    expect(original.body.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe(
      'More & "FAQ"'
    );
    expect(original.body.content?.[1]?.content?.[0]?.text).toBe(
      ':::details Literal'
    );
    expect(parseWikiMarkdown(stringifyWikiMarkdown(original.body))).toEqual(
      original
    );
  });

  it.each([
    ['## Heading\n\n<Unknown />', 3],
    ['## Heading\n\n<a href="https://example.com">Link</a>', 3],
    ['## Heading\n\n<Card title={computeTitle()} />', 3],
    ['## Heading\n\n[Unmapped](/missing)', 3],
    ['## Heading\n\n![Unmapped](/images/missing.png)', 3],
    ['## Heading\n\nexport const item = 1', 3],
  ])('reports unrepresentable source with a line number', (source, line) => {
    expect(() => parseWikiMarkdown(source, { format: 'mdx' })).toThrow(
      `Line ${line}:`
    );
  });

  it('maps generated comments, inline callouts and static anchors', () => {
    const original = parseWikiMarkdown(
      [
        '{/* Generated inventory */}',
        '',
        '<Warning>Read the [`guide`](#follow-up).</Warning>',
        '',
        'Follow up <a id="follow-up"></a> here.',
      ].join('\n'),
      { format: 'mdx' }
    );
    expect(original.body.content?.map((node) => node.type)).toEqual([
      'callout',
      'paragraph',
    ]);
    expect(renderWikiHtml(original.body)).toContain(
      '<span id="wiki-heading-follow-up"></span>'
    );
    expect(parseWikiMarkdown(stringifyWikiMarkdown(original.body))).toEqual(
      original
    );
  });

  it('rejects disallowed protocols before calling the import resolver', () => {
    const resolveLink = () => '/wiki/tuturuuu/overview';
    expect(() =>
      parseWikiMarkdown('[Sample](javascript:test)', {
        format: 'mdx',
        resolveLink,
      })
    ).toThrow('Unsupported or unresolved link');
  });

  it('requires opt-in for static demos and leaves the source inert', () => {
    const source = "import Counter from './counter';\n\n<Counter />";
    expect(() => parseWikiMarkdown(source, { format: 'mdx' })).toThrow(
      'Executable MDX'
    );
    const parsed = parseWikiMarkdown(source, {
      format: 'mdx',
      staticDemos: true,
    });
    expect(renderWikiHtml(parsed.body)).toContain('&lt;Counter /&gt;');
    expect(() =>
      parseWikiMarkdown('<Unknown />', { format: 'mdx', staticDemos: true })
    ).toThrow('Unsupported');
  });
});
