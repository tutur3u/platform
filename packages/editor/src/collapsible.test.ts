// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { Collapsible, CollapsibleSummary } from './collapsible.js';

const toggleContent = {
  content: [
    {
      content: [
        {
          content: [{ text: 'Section title', type: 'text' }],
          type: 'collapsibleSummary',
        },
        {
          content: [{ text: 'Section body', type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'collapsible',
    },
  ],
  type: 'doc',
};

function createEditor() {
  return new Editor({
    content: toggleContent,
    extensions: [StarterKit, CollapsibleSummary, Collapsible],
  });
}

describe('collapsible editing', () => {
  it('removes a toggle with Backspace from the start of its summary', () => {
    const editor = createEditor();
    editor.commands.setTextSelection(2);

    expect(editor.commands.keyboardShortcut('Backspace')).toBe(true);
    expect(editor.getJSON().content).toEqual([{ type: 'paragraph' }]);
    editor.destroy();
  });

  it('removes a toggle with Delete from the end of its body', () => {
    const editor = createEditor();
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);

    expect(editor.commands.keyboardShortcut('Delete')).toBe(true);
    expect(editor.getJSON().content).toEqual([{ type: 'paragraph' }]);
    editor.destroy();
  });
});
