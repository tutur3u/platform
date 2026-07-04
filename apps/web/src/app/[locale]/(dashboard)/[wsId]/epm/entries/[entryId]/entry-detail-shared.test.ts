import type { JSONContent } from '@tiptap/react';
import { describe, expect, it } from 'vitest';
import {
  parseEntryDescriptionContent,
  serializeEntryDescriptionContent,
} from './entry-detail-shared';

describe('entry-detail-shared description content', () => {
  it('preserves valid editor JSON documents', () => {
    const content: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Stable lore' }],
        },
      ],
    };

    expect(parseEntryDescriptionContent(JSON.stringify(content))).toEqual(
      content
    );
  });

  it('treats malformed editor JSON as plain text content', () => {
    const serializedPlainText = serializeEntryDescriptionContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '{"content":{}}' }],
        },
      ],
    });

    expect(serializedPlainText).toBe('{"content":{}}');
    expect(parseEntryDescriptionContent(serializedPlainText)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '{"content":{}}',
            },
          ],
        },
      ],
    });
  });
});
