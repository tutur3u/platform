import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { allBlocks, samplePage } from '../schema/fixtures.test-utils';
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
});
