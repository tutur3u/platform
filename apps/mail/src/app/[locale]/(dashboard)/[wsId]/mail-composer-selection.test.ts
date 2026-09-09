// @vitest-environment jsdom
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { captureComposerSelection } from './mail-composer-selection';

describe('selected passage AI replacement', () => {
  it('replaces only the captured passage, escapes generated HTML and supports undo', () => {
    const editor = new Editor({
      extensions: [StarterKit],
      content: '<p>Hello rough phrase friend.</p>',
    });
    editor.commands.setTextSelection({ from: 7, to: 19 });
    const selection = captureComposerSelection(editor)!;
    expect(selection.text).toBe('rough phrase');
    expect(selection.apply('clear <phrase>')).toBe(true);
    expect(editor.getText()).toBe('Hello clear <phrase> friend.');
    expect(editor.getHTML()).toContain('&lt;phrase&gt;');
    editor.commands.undo();
    expect(editor.getText()).toBe('Hello rough phrase friend.');
    editor.destroy();
  });
  it('refuses a stale replacement after the document changes', () => {
    const editor = new Editor({
      extensions: [StarterKit],
      content: '<p>Original passage</p>',
    });
    editor.commands.setTextSelection({ from: 1, to: 9 });
    const selection = captureComposerSelection(editor)!;
    editor.commands.setContent('<p>New draft</p>');
    expect(selection.apply('Wrong replacement')).toBe(false);
    expect(editor.getText()).toBe('New draft');
    editor.destroy();
  });
});
