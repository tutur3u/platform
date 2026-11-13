import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { allBlocks, samplePage } from '../schema/fixtures.test-utils';
import { cmsPageSchema } from '../schema/schema';
import { CmsPageRenderer, renderCmsBlock, safeUrl } from './render';

describe('cms block renderers', () => {
  it.each(allBlocks)('renders $type on the server', (block) => {
    expect(renderToStaticMarkup(renderCmsBlock(block))).toContain(
      `data-block="${block.type}"`
    );
  });

  it('renders a full page with TipTap content and nested columns', () => {
    const html = renderToStaticMarkup(<CmsPageRenderer page={samplePage} />);
    expect(html).toContain('<p>Hello IEEAI</p><p><strong>Bold</strong></p>');
    expect(html).toMatch(
      /data-block="TwoColumn"[^>]*><div><div[^>]*data-block="RichText"/
    );
  });

  it('drops unsafe URLs', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('//evil.example')).toBeUndefined();
    expect(safeUrl('/events')).toBe('/events');
    const html = renderToStaticMarkup(
      renderCmsBlock({
        props: {
          href: 'javascript:alert(1)',
          id: 'x',
          label: 'X',
          variant: 'primary',
        },
        type: 'CtaButton',
      })
    );
    expect(html).not.toContain('javascript:');
  });

  it('rejects non-scalar TipTap attributes before rendering', () => {
    const malformed = { toString: 0, valueOf: 0 };
    const page = cmsPageSchema.safeParse({
      ...samplePage,
      content: [
        {
          props: {
            doc: {
              content: [
                {
                  attrs: { level: malformed },
                  content: [{ text: 'Paragraph', type: 'text' }],
                  type: 'paragraph',
                },
                {
                  attrs: { level: malformed },
                  content: [{ text: 'Heading', type: 'text' }],
                  type: 'heading',
                },
                {
                  content: [
                    {
                      marks: [{ attrs: { href: malformed }, type: 'link' }],
                      text: 'Unlinked',
                      type: 'text',
                    },
                  ],
                  type: 'paragraph',
                },
              ],
              type: 'doc',
            },
            id: 'malformed-attributes',
          },
          type: 'RichText',
        },
      ],
    });
    expect(page.success).toBe(false);
  });

  it('preserves numeric headings and string link URLs', () => {
    const block = {
      props: {
        doc: {
          content: [
            {
              attrs: { level: 3 },
              content: [
                {
                  marks: [{ attrs: { href: '/events' }, type: 'link' }],
                  text: 'Events',
                  type: 'text',
                },
              ],
              type: 'heading',
            },
          ],
          type: 'doc',
        },
        id: 'normal-attributes',
      },
      type: 'RichText',
    } satisfies Parameters<typeof renderCmsBlock>[0];
    const html = renderToStaticMarkup(renderCmsBlock(block));
    expect(html).toContain('<h3><a href="/events"');
    expect(html).toContain('>Events</a></h3>');
  });
});
