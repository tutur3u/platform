import { Schema, Slice } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import {
  serializeClipboardPlainText,
  serializeClipboardText,
} from './clipboard-serialization';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    citation: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { citationId: {}, snapshot: {} },
    },
    citationBibliography: { group: 'block', atom: true },
  },
});

const document = schema.nodeFromJSON({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Synthetic finding ' },
        {
          type: 'citation',
          attrs: {
            citationId: 'cit_synthetic',
            snapshot: { version: 999, work: { title: 'Fictional rivers' } },
          },
        },
      ],
    },
    { type: 'citationBibliography' },
  ],
});
const slice = new Slice(document.content, 0, 0);
const formatted = {
  inText: { cit_synthetic: '(Vale, 2026, p. 12)' },
  bibliography: [
    {
      key: 'synthetic',
      text: 'Vale, M. (2026). Fictional rivers.',
      citationIds: ['cit_synthetic'],
    },
  ],
};

describe('citation clipboard serialization', () => {
  it('uses injected document formatting for both copy modes', () => {
    const expected =
      'Synthetic finding (Vale, 2026, p. 12)\n\nVale, M. (2026). Fictional rivers.';
    expect(serializeClipboardPlainText(slice, formatted)).toBe(expected);
    expect(serializeClipboardText(slice, formatted)).toBe(expected);
  });

  it('keeps readable title and reference markers without a host formatter', () => {
    const expected = 'Synthetic finding (Fictional rivers)\n\n(references)';
    expect(serializeClipboardPlainText(slice)).toBe(expected);
    expect(serializeClipboardText(slice)).toBe(expected);
  });
});
