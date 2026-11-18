import { describe, expect, it } from 'vitest';
import {
  type DocumentNode,
  findMiraText,
  miraTextBlocks,
  miraTextToContent,
  sectionAt,
} from './document-mira-edit';

/** Minimal ProseMirror-shaped tree: doc > blocks > text, with real positions. */
function documentOf(blocks: Array<{ type: string; text: string }>) {
  const children: Array<{
    node: DocumentNode;
    pos: number;
    text: DocumentNode;
  }> = [];
  let pos = 0;
  for (const block of blocks) {
    const text: DocumentNode = {
      isText: true,
      isTextblock: false,
      text: block.text,
      textContent: block.text,
      type: { name: 'text' },
      descendants: () => undefined,
    };
    children.push({
      pos,
      text,
      node: {
        isText: false,
        isTextblock: true,
        textContent: block.text,
        type: { name: block.type },
        descendants: () => undefined,
      },
    });
    pos += block.text.length + 2;
  }
  const doc: DocumentNode = {
    isText: false,
    isTextblock: false,
    textContent: blocks.map((block) => block.text).join(''),
    type: { name: 'doc' },
    descendants: (visit) => {
      for (const child of children)
        if (visit(child.node, child.pos) !== false)
          visit(child.text, child.pos + 1);
    },
  };
  return doc;
}

describe('Mira document insertion', () => {
  it('turns plain model text into paragraphs and bullet lists without HTML', () => {
    expect(
      miraTextBlocks('Summary\r\n\n- One\n* Two\n3. Three\n<b>x</b>')
    ).toEqual([
      { type: 'paragraph', text: 'Summary' },
      { type: 'bullet', text: 'One' },
      { type: 'bullet', text: 'Two' },
      { type: 'bullet', text: 'Three' },
      { type: 'paragraph', text: '<b>x</b>' },
    ]);
    expect(miraTextToContent('Intro\n- A\n- B\nEnd')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
            ],
          },
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
            ],
          },
        ],
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'End' }] },
    ]);
  });

  it('finds inserted text across blocks so the requester can undo it', () => {
    const doc = documentOf([
      { type: 'heading', text: '§2 Grading Criteria' },
      { type: 'paragraph', text: 'Partial credit: award 15/30.' },
      { type: 'paragraph', text: 'Explain the bug.' },
    ]);
    expect(findMiraText(doc, 'award 15/30.')).toEqual({ from: 38, to: 50 });
    expect(
      findMiraText(doc, 'Partial credit: award 15/30.\n- Explain the bug.')
    ).toEqual({ from: 22, to: 68 });
    expect(findMiraText(doc, 'Not in the document')).toBeNull();
    expect(findMiraText(doc, '   ')).toBeNull();
  });

  it('names the section from the nearest heading before the cursor', () => {
    const doc = documentOf([
      { type: 'heading', text: '§1 Objectives' },
      { type: 'paragraph', text: 'Implement count_paths.' },
      { type: 'heading', text: '§2 Grading Criteria' },
      { type: 'paragraph', text: 'Correct base case.' },
    ]);
    expect(sectionAt(doc, 20)).toBe('§1 Objectives');
    expect(sectionAt(doc, 60)).toBe('§2 Grading Criteria');
    expect(sectionAt(documentOf([{ type: 'paragraph', text: 'x' }]), 1)).toBe(
      undefined
    );
  });
});
