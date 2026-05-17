import { Schema } from '@tiptap/pm/model';
import type { JSONContent } from '@tiptap/react';
import {
  convertJsonContentToYjsState,
  convertYjsStateToJsonContent,
} from '@tuturuuu/utils/yjs-helper';
import { describe, expect, it } from 'vitest';

const tiptapSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
    },
    bulletList: {
      group: 'block',
      content: 'listItem+',
    },
    listItem: {
      content: 'paragraph block*',
      defining: true,
    },
    text: { group: 'inline' },
  },
  marks: {
    bold: {},
  },
});

describe('task Yjs ProseMirror compatibility', () => {
  it('round-trips task description Yjs state with the TipTap schema instance', () => {
    const description: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Realtime task notes' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', marks: [{ type: 'bold' }], text: 'Done' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(description, tiptapSchema);

    expect(convertYjsStateToJsonContent(yjsState, tiptapSchema)).toEqual(
      description
    );
  });
});
