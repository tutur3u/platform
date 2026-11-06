import { describe, expect, it } from 'vitest';
import { resolveDocumentImageSources } from './document-image-sources';

const WS = '11111111-1111-4111-8111-111111111111';
const legacy = `https://project.supabase.co/storage/v1/object/sign/workspaces/${WS}/documents/1-a.png?token=one-year-token`;

describe('resolveDocumentImageSources', () => {
  it('rewrites nested legacy signed image URLs to sign-on-read share URLs', () => {
    const result = resolveDocumentImageSources({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'hello' }],
        },
        { type: 'image', attrs: { src: legacy, alt: 'chart' } },
        {
          type: 'blockquote',
          content: [{ type: 'image', attrs: { src: legacy } }],
        },
      ],
    });

    const share = `/api/v1/workspaces/${WS}/storage/share?path=documents%2F1-a.png`;
    expect(result.content?.[1]).toEqual({
      type: 'image',
      attrs: { src: share, alt: 'chart' },
    });
    expect(result.content?.[2]?.content?.[0]?.attrs?.src).toBe(share);
    expect(result.content?.[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'hello' }],
    });
    expect(JSON.stringify(result)).not.toContain('one-year-token');
  });

  it('keeps external images and non-image src attributes unchanged', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'https://example.com/a.png' } },
        { type: 'embed', attrs: { src: legacy } },
      ],
    };
    expect(resolveDocumentImageSources(content)).toEqual(content);
  });
});
