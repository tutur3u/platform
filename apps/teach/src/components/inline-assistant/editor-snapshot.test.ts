import { Schema } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { readEditorSnapshot, suggestionRange } from './editor-snapshot';

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    hardBreak: { inline: true, group: 'inline' },
    image: { inline: true, group: 'inline', atom: true },
  },
  marks: { bold: {} },
});
const paragraph = (text: string) =>
  schema.node('paragraph', null, text ? schema.text(text) : undefined);
const suggestion = (from: number, to: number, original: string) => ({
  id: 'test',
  from,
  to,
  original,
  explanation: 'Hint',
});

describe('rich-text assistance positions', () => {
  it('maps UTF-16 offsets through paragraphs and preserves empty blocks', () => {
    const doc = schema.node('doc', null, [
      paragraph('🧪 First'),
      paragraph(''),
      paragraph('She go'),
    ]);
    expect(readEditorSnapshot(doc).text).toBe('🧪 First\n\nShe go');
    const range = suggestionRange(doc, suggestion(14, 16, 'go'));
    expect(range).not.toBeNull();
    expect(doc.textBetween(range!.from, range!.to)).toBe('go');
  });
  it('rejects cross-paragraph and hard-break replacement ranges', () => {
    const doc = schema.node('doc', null, [paragraph('One'), paragraph('Two')]);
    expect(suggestionRange(doc, suggestion(0, 7, 'One\nTwo'))).toBeNull();
    const line = schema.node(
      'doc',
      null,
      schema.node('paragraph', null, [
        schema.text('A'),
        schema.node('hardBreak'),
        schema.text('B'),
      ])
    );
    expect(readEditorSnapshot(line).text).toBe('A\nB');
    expect(suggestionRange(line, suggestion(0, 3, 'A\nB'))).toBeNull();
  });
  it('maps adjacent text nodes with different marks without flattening them', () => {
    const doc = schema.node(
      'doc',
      null,
      schema.node('paragraph', null, [
        schema.text('She '),
        schema.text('go', [schema.mark('bold')]),
      ])
    );
    expect(suggestionRange(doc, suggestion(4, 6, 'go'))).toEqual({
      from: 5,
      to: 7,
    });
    expect(suggestionRange(doc, suggestion(4, 6, 'no'))).toBeNull();
  });
  it('never replaces across inline atoms', () => {
    const doc = schema.node(
      'doc',
      null,
      schema.node('paragraph', null, [
        schema.text('A'),
        schema.node('image'),
        schema.text('B'),
      ])
    );
    expect(readEditorSnapshot(doc).text).toBe('A\ufffcB');
    expect(suggestionRange(doc, suggestion(0, 3, 'A\ufffcB'))).toBeNull();
  });
});
