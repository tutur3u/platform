import { describe, expect, it } from 'vitest';
import { renderWikiHtml } from './render';
import { wikiDocumentSchema } from './schema';

const doc = (...content: unknown[]) => ({ type: 'doc', content });
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content });

describe('shared-origin HTML', () => {
  it('escapes literal HTML in text, code, and attributes', () => {
    const sample = '<script>test</script>';
    const rendered = renderWikiHtml(
      doc(
        paragraph({ type: 'text', text: sample }),
        {
          type: 'codeBlock',
          attrs: { language: 'mermaid', title: sample },
          content: [{ type: 'text', text: sample }],
        },
        {
          type: 'image',
          attrs: {
            src: `/wiki/tuturuuu/_assets/${'a'.repeat(64)}`,
            alt: '" < > &',
          },
        },
        {
          type: 'card',
          attrs: { href: 'https://example.com/?a=1&b=2', title: sample },
        }
      )
    );
    expect(rendered).toContain('&lt;script&gt;test&lt;/script&gt;');
    expect(rendered).toContain('alt="&quot; &lt; &gt; &amp;"');
    expect(rendered).toContain('href="https://example.com/?a=1&amp;b=2"');
    expect(rendered).not.toMatch(
      /<(script|iframe|svg)\b|\s(?:style|onload|onerror)=/i
    );
  });

  it.each([
    'javascript:test',
    'JaVaScRiPt:test',
    'data:text/html,test',
    'https:\\example.com',
    '//example.com',
    'java\nscript:test',
    '/wiki/tuturuuu/../private',
    'https://tuturuuu.com/wiki/tuturuuu/%2e%2e/private',
    '/api/v1/example',
    'https://www.tuturuuu.com/api/v1/example',
  ])('refuses unsupported URL syntax %j', (href) => {
    expect(() =>
      renderWikiHtml(
        doc(
          paragraph({
            type: 'text',
            text: 'URL',
            marks: [{ type: 'link', attrs: { href } }],
          })
        )
      )
    ).toThrow();
    expect(() =>
      renderWikiHtml(doc({ type: 'card', attrs: { title: 'URL', href } }))
    ).toThrow();
  });

  it.each([
    { type: 'html', text: '<b>Raw</b>' },
    { type: 'iframe', attrs: { src: 'https://example.com' } },
    { type: 'image', attrs: { src: 'https://example.com/p.png' } },
    { type: 'image', attrs: { src: 'data:image/png,fixture' } },
    { type: 'paragraph', attrs: { onload: 'sample' } },
    { type: 'heading', attrs: { level: '1', id: 'submit' } },
    { type: 'heading', attrs: { level: 1, id: '" autofocus' } },
    {
      type: 'text',
      text: 'text',
      marks: [{ type: 'textStyle', attrs: { color: 'red' } }],
    },
  ])('rejects nodes and attributes outside the allowlist', (node) => {
    expect(() => renderWikiHtml(doc(node))).toThrow();
  });

  it('scopes heading IDs and same-origin fragments to wiki content', () => {
    const html = renderWikiHtml(
      doc(
        { type: 'heading', attrs: { level: 2, id: 'submit' } },
        paragraph({
          type: 'text',
          text: 'Jump',
          marks: [
            { type: 'link', attrs: { href: '/wiki/tuturuuu/page#submit' } },
          ],
        }),
        paragraph({
          type: 'text',
          text: 'External',
          marks: [
            { type: 'link', attrs: { href: 'https://example.com/#submit' } },
          ],
        })
      )
    );
    expect(html).toContain('id="wiki-heading-submit"');
    expect(html).toContain('href="/wiki/tuturuuu/page#wiki-heading-submit"');
    expect(html).toContain('href="https://example.com/#submit"');
  });

  it('rejects excessive depth, cycles and duplicate IDs', () => {
    const deep = Array.from({ length: 60 }).reduce<unknown>(
      (content) => ({ type: 'blockquote', content: [content] }),
      paragraph()
    );
    const cyclic: { type: string; content: unknown[] } = {
      type: 'blockquote',
      content: [],
    };
    cyclic.content.push(cyclic);
    const heading = { type: 'heading', attrs: { level: 2, id: 'duplicate' } };
    for (const body of [doc(deep), doc(cyclic), doc(heading, heading)])
      expect(wikiDocumentSchema.safeParse(body).success).toBe(false);
  });
});
