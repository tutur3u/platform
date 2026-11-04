import { describe, expect, it } from 'vitest';
import { tipTapDocSchema } from './schema';

const unsafeTypes = [
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'hasOwnProperty',
];

describe('TipTap type keys', () => {
  it.each(unsafeTypes)('rejects %s as a node type', (type) => {
    expect(
      tipTapDocSchema.safeParse({ type: 'doc', content: [{ type }] }).success
    ).toBe(false);
  });

  it.each(unsafeTypes)('rejects %s as a mark type', (type) => {
    expect(
      tipTapDocSchema.safeParse({
        type: 'doc',
        content: [{ type: 'text', text: 'Hello', marks: [{ type }] }],
      }).success
    ).toBe(false);
  });

  it.each(unsafeTypes)('rejects %s in a nested node', (type) => {
    expect(
      tipTapDocSchema.safeParse({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type }] }],
      }).success
    ).toBe(false);
  });

  it('preserves known node and mark types through nested content', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Hello',
              marks: [
                { type: 'bold' },
                { type: 'italic' },
                { type: 'link', attrs: { href: '/events' } },
              ],
            },
          ],
        },
        { type: 'heading', attrs: { level: 2 } },
        { type: 'hardBreak' },
      ],
    };
    expect(tipTapDocSchema.parse(doc)).toEqual(doc);
  });
});
