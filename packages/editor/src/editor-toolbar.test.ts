// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { Collapsible, CollapsibleSummary } from './collapsible.js';
import { insertCollapsibleSection } from './editor-toolbar.js';

describe('collapsible toolbar action', () => {
  it('keeps selected prose when inserting a toggle section', () => {
    const editor = new Editor({
      content: '<p>Keep this prose</p>',
      extensions: [StarterKit, CollapsibleSummary, Collapsible],
    });
    editor.commands.setTextSelection({ from: 1, to: 16 });

    expect(insertCollapsibleSection(editor, 'Section title')).toBe(true);
    expect(editor.getText()).toContain('Keep this prose');
    expect(editor.getJSON().content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'collapsible' })])
    );
    editor.destroy();
  });
});
