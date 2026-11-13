import { CMS_BLOCKS_SCHEMA_VERSION } from '@tuturuuu/cms-blocks/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  type DeliveryPayload,
  renderDeliveryBlock,
  selectSitePage,
} from './site';

const entry = (slug: string) => ({
  id: slug,
  slug,
  title: slug,
  assets: [],
  blocks: [],
});

const payload: DeliveryPayload = {
  collections: [
    { id: 'p', slug: 'pages', title: 'Pages', entries: [entry('about')] },
    { id: 'b', slug: 'blog', title: 'Blog', entries: [entry('first-post')] },
  ],
};

describe('selectSitePage', () => {
  it('maps paths onto collections and entries', () => {
    expect(selectSitePage(payload, '/')).toEqual({ kind: 'index' });
    expect(selectSitePage(payload, '/about')).toMatchObject({
      kind: 'entry',
      entry: { slug: 'about' },
    });
    expect(selectSitePage(payload, '/blog')).toMatchObject({
      kind: 'collection',
    });
    expect(selectSitePage(payload, '/blog/first-post/')).toMatchObject({
      kind: 'entry',
      entry: { slug: 'first-post' },
    });
    expect(selectSitePage(payload, '/blog/missing')).toBeNull();
    expect(selectSitePage(payload, '/a/b/c')).toBeNull();
    expect(selectSitePage(payload, '/%E0%A4%A')).toBeNull();
  });
});

describe('renderDeliveryBlock', () => {
  it('renders a stored CMS page through cms-blocks', () => {
    const html = renderToStaticMarkup(
      <>
        {renderDeliveryBlock({
          id: 'b',
          block_type: 'page',
          sort_order: 0,
          content: {
            content: [
              {
                type: 'Hero',
                props: {
                  id: 'h',
                  ctaHref: '',
                  ctaLabel: '',
                  imageUrl: '',
                  subtitle: '',
                  title: 'Big title',
                },
              },
            ],
            root: { props: { title: 'x' } },
            schemaVersion: CMS_BLOCKS_SCHEMA_VERSION,
          },
        })}
      </>
    );
    expect(html).toContain('data-block="Hero"');
    expect(html).toContain('Big title');
  });

  it('ignores unknown block content', () => {
    expect(
      renderDeliveryBlock({
        id: 'b',
        block_type: 'x',
        sort_order: 0,
        content: { foo: 1 },
      })
    ).toBeNull();
  });
});
