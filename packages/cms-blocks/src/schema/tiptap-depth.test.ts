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
});
