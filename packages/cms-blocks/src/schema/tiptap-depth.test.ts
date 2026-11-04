import { describe, expect, it } from 'vitest';
import {
  CMS_TIPTAP_MAX_DEPTH,
  type TipTapNode,
  tipTapDocSchema,
} from './schema';

function documentAtDepth(depth: number) {
  let node: TipTapNode = { type: 'text', text: 'Hello' };
  for (let level = 1; level < depth; level++) {
    node = { type: 'blockquote', content: [node] };
  }
  return { type: 'doc', content: [node] };
}

describe('TipTap depth boundary', () => {
  it('accepts nodes at the maximum depth', () => {
    expect(
      tipTapDocSchema.safeParse(documentAtDepth(CMS_TIPTAP_MAX_DEPTH)).success
    ).toBe(true);
  });
  it.each([CMS_TIPTAP_MAX_DEPTH + 1, 10000])(
    'rejects depth %i without a stack overflow',
    (depth) => {
      expect(tipTapDocSchema.safeParse(documentAtDepth(depth)).success).toBe(
        false
      );
    }
  );

  it('accepts flat primitive node and mark attributes', () => {
    expect(
      tipTapDocSchema.safeParse({
        content: [
          {
            attrs: { level: 2, title: 'Heading', visible: true },
            marks: [
              {
                attrs: { href: 'https://example.com', target: null },
                type: 'link',
              },
            ],
            text: 'Hello',
            type: 'text',
          },
        ],
        type: 'doc',
      }).success
    ).toBe(true);
  });

  it('rejects nested attributes without traversing their depth', () => {
    const nested = `${'{"nested":'.repeat(10000)}"value"${'}'.repeat(10000)}`;
    const attrs = JSON.parse(nested);
    expect(
      tipTapDocSchema.safeParse({
        content: [{ attrs, type: 'paragraph' }],
        type: 'doc',
      }).success
    ).toBe(false);
  });
});
