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
  it('exposes and updates the disclosure state', () => {
    const editor = createEditor();
    const disclosure = editor.view.dom.querySelector<HTMLButtonElement>(
      '.tuturuuu-editor-collapsible-toggle'
    );

    expect(disclosure?.getAttribute('aria-expanded')).toBe('true');
    disclosure?.click();
    expect(disclosure?.getAttribute('aria-expanded')).toBe('false');
    disclosure?.click();
    expect(disclosure?.getAttribute('aria-expanded')).toBe('true');
    editor.destroy();
  });

  it('synchronizes the disclosure state after native details toggles', () => {
    const editor = createEditor();
    const details = editor.view.dom.querySelector('details');
    const disclosure = editor.view.dom.querySelector<HTMLButtonElement>(
      '.tuturuuu-editor-collapsible-toggle'
    );

    expect(details).not.toBeNull();
    details!.open = false;
    details!.dispatchEvent(new Event('toggle'));
    expect(disclosure?.getAttribute('aria-expanded')).toBe('false');

    details!.open = true;
    details!.dispatchEvent(new Event('toggle'));
    expect(disclosure?.getAttribute('aria-expanded')).toBe('true');
    editor.destroy();
  });

  it('keeps summary text editable without disabling native read-only toggles', () => {
    const editor = createEditor();
    document.body.append(editor.view.dom);
    const summary = editor.view.dom.querySelector('summary');
    const summaryContent = editor.view.dom.querySelector(
      '.tuturuuu-editor-collapsible-summary-content'
    );

    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(summaryContent!.firstChild!, 4);
    range.setEnd(summaryContent!.firstChild!, 9);
    selection?.removeAllRanges();
    selection?.addRange(range);
    expect(selection?.toString()).toBe('ion t');

    expect(
      summaryContent?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      )
    ).toBe(false);
    expect(editor.state.selection.from).toBe(6);
    expect(editor.state.selection.to).toBe(11);
    editor.setEditable(false);
    expect(
      summary?.dispatchEvent(new MouseEvent('click', { cancelable: true }))
    ).toBe(true);
    editor.destroy();
  });

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
