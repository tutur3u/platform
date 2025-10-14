import { describe, expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import type { JSONContent } from '@tiptap/react';
import {
  convertJsonContentToYjsState,
  convertYjsStateToJsonContent,
} from '../yjs-helper';

// Create a basic ProseMirror schema for testing
const testSchema = new Schema({
  nodes: {
    doc: {
      content: 'block+',
    },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0];
      },
    },
    text: {
      group: 'inline',
    },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      parseDOM: [
        { tag: 'h1', attrs: { level: 1 } },
        { tag: 'h2', attrs: { level: 2 } },
        { tag: 'h3', attrs: { level: 3 } },
      ],
      toDOM(node) {
        return ['h' + node.attrs.level, 0];
      },
    },
    blockquote: {
      content: 'block+',
      group: 'block',
      parseDOM: [{ tag: 'blockquote' }],
      toDOM() {
        return ['blockquote', 0];
      },
    },
  },
  marks: {
    strong: {
      parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
      toDOM() {
        return ['strong', 0];
      },
    },
    em: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }],
      toDOM() {
        return ['em', 0];
      },
    },
  },
});

describe('convertJsonContentToYjsState', () => {
  it('converts simple paragraph JSONContent to Yjs state', () => {
    const jsonContent: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Hello, world!',
            },
          ],
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(jsonContent, testSchema);

    expect(yjsState).toBeInstanceOf(Uint8Array);
    expect(yjsState.length).toBeGreaterThan(0);
  });

  it('converts empty document to Yjs state', () => {
    const jsonContent: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(jsonContent, testSchema);

    expect(yjsState).toBeInstanceOf(Uint8Array);
    expect(yjsState.length).toBeGreaterThan(0);
  });

  it('converts complex nested content to Yjs state', () => {
    const jsonContent: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Title' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'This is ' },
            { type: 'text', marks: [{ type: 'strong' }], text: 'bold' },
            { type: 'text', text: ' and ' },
            { type: 'text', marks: [{ type: 'em' }], text: 'italic' },
            { type: 'text', text: ' text.' },
          ],
        },
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'A quoted paragraph' }],
            },
          ],
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(jsonContent, testSchema);

    expect(yjsState).toBeInstanceOf(Uint8Array);
    expect(yjsState.length).toBeGreaterThan(0);
  });

  it('converts document with multiple paragraphs', () => {
    const jsonContent: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'First paragraph' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Second paragraph' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Third paragraph' }],
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(jsonContent, testSchema);

    expect(yjsState).toBeInstanceOf(Uint8Array);
    expect(yjsState.length).toBeGreaterThan(0);
  });
});

describe('convertYjsStateToJsonContent', () => {
  it('converts Yjs state back to JSONContent', () => {
    const originalJson: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Test content',
            },
          ],
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(originalJson, testSchema);
    const resultJson = convertYjsStateToJsonContent(yjsState, testSchema);

    expect(resultJson).toBeDefined();
    expect(resultJson.type).toBe('doc');
    expect(resultJson.content).toBeDefined();
  });

  it('preserves text content through conversion', () => {
    const originalJson: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Preserved text' }],
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(originalJson, testSchema);
    const resultJson = convertYjsStateToJsonContent(yjsState, testSchema);

    expect(resultJson.content?.[0]).toBeDefined();
    expect(resultJson.content?.[0].type).toBe('paragraph');
    expect(resultJson.content?.[0].content?.[0]).toBeDefined();
    expect(resultJson.content?.[0].content?.[0].text).toBe('Preserved text');
  });

  it('preserves marks through conversion', () => {
    const originalJson: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', marks: [{ type: 'strong' }], text: 'Bold text' },
          ],
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(originalJson, testSchema);
    const resultJson = convertYjsStateToJsonContent(yjsState, testSchema);

    const textNode = resultJson.content?.[0].content?.[0];
    expect(textNode?.marks).toBeDefined();
    expect(textNode?.marks?.[0].type).toBe('strong');
    expect(textNode?.text).toBe('Bold text');
  });

  it('preserves node attributes through conversion', () => {
    const originalJson: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Heading 2' }],
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(originalJson, testSchema);
    const resultJson = convertYjsStateToJsonContent(yjsState, testSchema);

    const headingNode = resultJson.content?.[0];
    expect(headingNode?.type).toBe('heading');
    expect(headingNode?.attrs?.level).toBe(2);
    expect(headingNode?.content?.[0].text).toBe('Heading 2');
  });
});

describe('round-trip conversion', () => {
  it('preserves simple content through round-trip conversion', () => {
    const originalJson: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Round trip test' }],
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(originalJson, testSchema);
    const resultJson = convertYjsStateToJsonContent(yjsState, testSchema);

    expect(resultJson.type).toBe(originalJson.type);
    expect(resultJson.content?.[0].type).toBe(
      originalJson.content?.[0].type
    );
    expect(resultJson.content?.[0].content?.[0].text).toBe(
      originalJson.content?.[0].content?.[0].text
    );
  });

  it('preserves complex nested structure through round-trip', () => {
    const originalJson: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Main Title' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Regular text with ' },
            { type: 'text', marks: [{ type: 'strong' }], text: 'bold' },
            { type: 'text', text: ' and ' },
            {
              type: 'text',
              marks: [{ type: 'em' }, { type: 'strong' }],
              text: 'bold italic',
            },
            { type: 'text', text: '.' },
          ],
        },
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Quoted text' }],
            },
          ],
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(originalJson, testSchema);
    const resultJson = convertYjsStateToJsonContent(yjsState, testSchema);

    // Verify structure
    expect(resultJson.type).toBe('doc');
    expect(resultJson.content?.length).toBe(3);

    // Verify heading
    const heading = resultJson.content?.[0];
    expect(heading?.type).toBe('heading');
    expect(heading?.attrs?.level).toBe(1);
    expect(heading?.content?.[0].text).toBe('Main Title');

    // Verify paragraph with marks
    const paragraph = resultJson.content?.[1];
    expect(paragraph?.type).toBe('paragraph');
    expect(paragraph?.content?.length).toBe(5);

    // Verify blockquote
    const blockquote = resultJson.content?.[2];
    expect(blockquote?.type).toBe('blockquote');
    expect(blockquote?.content?.[0].type).toBe('paragraph');
    expect(blockquote?.content?.[0].content?.[0].text).toBe('Quoted text');
  });

  it('preserves empty paragraphs through round-trip', () => {
    const originalJson: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Content' }],
        },
        {
          type: 'paragraph',
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(originalJson, testSchema);
    const resultJson = convertYjsStateToJsonContent(yjsState, testSchema);

    expect(resultJson.content?.length).toBe(3);
    expect(resultJson.content?.[0].type).toBe('paragraph');
    expect(resultJson.content?.[1].content?.[0].text).toBe('Content');
    expect(resultJson.content?.[2].type).toBe('paragraph');
  });

  it('handles multiple consecutive text nodes with different marks', () => {
    const originalJson: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Normal ' },
            { type: 'text', marks: [{ type: 'strong' }], text: 'bold ' },
            { type: 'text', marks: [{ type: 'em' }], text: 'italic ' },
            {
              type: 'text',
              marks: [{ type: 'strong' }, { type: 'em' }],
              text: 'both',
            },
          ],
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(originalJson, testSchema);
    const resultJson = convertYjsStateToJsonContent(yjsState, testSchema);

    const content = resultJson.content?.[0].content;
    expect(content?.length).toBeGreaterThanOrEqual(4);

    // Check that marks are preserved
    const boldNode = content?.find(
      (node) =>
        node.marks?.length === 1 && node.marks[0].type === 'strong'
    );
    expect(boldNode).toBeDefined();

    const italicNode = content?.find(
      (node) =>
        node.marks?.length === 1 && node.marks[0].type === 'em'
    );
    expect(italicNode).toBeDefined();

    const bothNode = content?.find((node) => node.marks?.length === 2);
    expect(bothNode).toBeDefined();
  });

  it('preserves document with only empty paragraph', () => {
    const originalJson: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(originalJson, testSchema);
    const resultJson = convertYjsStateToJsonContent(yjsState, testSchema);

    expect(resultJson.type).toBe('doc');
    expect(resultJson.content?.length).toBe(1);
    expect(resultJson.content?.[0].type).toBe('paragraph');
  });
});

describe('edge cases', () => {
  it('handles document with deeply nested blockquotes', () => {
    const originalJson: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            {
              type: 'blockquote',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Nested quote' }],
                },
              ],
            },
          ],
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(originalJson, testSchema);
    const resultJson = convertYjsStateToJsonContent(yjsState, testSchema);

    expect(resultJson.content?.[0].type).toBe('blockquote');
    expect(resultJson.content?.[0].content?.[0].type).toBe('blockquote');
    expect(resultJson.content?.[0].content?.[0].content?.[0].type).toBe(
      'paragraph'
    );
  });

  it('handles various heading levels', () => {
    const originalJson: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'H1' }],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'H2' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'H3' }],
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(originalJson, testSchema);
    const resultJson = convertYjsStateToJsonContent(yjsState, testSchema);

    expect(resultJson.content?.[0].attrs?.level).toBe(1);
    expect(resultJson.content?.[1].attrs?.level).toBe(2);
    expect(resultJson.content?.[2].attrs?.level).toBe(3);
  });

  it('handles text with special characters', () => {
    const originalJson: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Special chars: <>&"\'éñ中文🚀',
            },
          ],
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(originalJson, testSchema);
    const resultJson = convertYjsStateToJsonContent(yjsState, testSchema);

    expect(resultJson.content?.[0].content?.[0].text).toBe(
      'Special chars: <>&"\'éñ中文🚀'
    );
  });

  it('handles long text content', () => {
    const longText = 'A'.repeat(10000);
    const originalJson: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: longText }],
        },
      ],
    };

    const yjsState = convertJsonContentToYjsState(originalJson, testSchema);
    const resultJson = convertYjsStateToJsonContent(yjsState, testSchema);

    expect(resultJson.content?.[0].content?.[0].text).toBe(longText);
    expect(resultJson.content?.[0].content?.[0].text?.length).toBe(10000);
  });
});
