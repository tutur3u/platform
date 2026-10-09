import type { LettinNode } from '@tuturuuu/internal-api/lettin';
import { expect, it } from 'vitest';
import { documentWritingStatistics } from './writing-statistics-model';

const text = (value: string): LettinNode => ({ type: 'text', text: value });
const paragraph = (...content: LettinNode[]): LettinNode => ({
  type: 'paragraph',
  content,
});
const doc = (...content: LettinNode[]): LettinNode => ({
  type: 'doc',
  content,
});

it('counts empty bodies as zero', () => {
  expect(documentWritingStatistics(doc(paragraph()))).toEqual({
    words: 0,
    characters: 0,
    truncated: false,
  });
});
it('joins adjacent marked runs but separates paragraphs, headings and table cells', () => {
  const content = doc(
    paragraph(text('hel'), { ...text('lo'), marks: [{ type: 'bold' }] }),
    { type: 'heading', content: [text('world')] },
    {
      type: 'tableRow',
      content: [
        { type: 'tableCell', content: [text('one')] },
        { type: 'tableHeader', content: [text('two')] },
      ],
    }
  );
  expect(documentWritingStatistics(content)).toEqual({
    words: 4,
    characters: 16,
    truncated: false,
  });
});
it('counts Unicode graphemes without whitespace and handles Vietnamese punctuation', () => {
  expect(
    documentWritingStatistics(
      doc(paragraph(text('Xin chào! a\u0301 👨‍👩‍👧‍👦\n')))
    )
  ).toEqual({ words: 3, characters: 10, truncated: false });
});
it('uses hard breaks as word boundaries and ignores hidden attributes/leaf children', () => {
  const content = doc(
    paragraph(
      text('one'),
      { type: 'hardBreak', content: [text('hidden')] },
      text('two')
    ),
    {
      type: 'image',
      attrs: { alt: 'private title', src: 'https://example.com/private' },
      content: [text('hidden')],
    },
    { type: 'horizontalRule', content: [text('hidden')] }
  );
  expect(documentWritingStatistics(content)).toEqual({
    words: 2,
    characters: 6,
    truncated: false,
  });
});
it('includes code and nested list body text without counting link metadata or task states', () => {
  const content = doc(
    { type: 'codeBlock', content: [text('return 42;')] },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [
            paragraph({
              ...text('Write next'),
              marks: [
                { type: 'link', attrs: { href: 'https://example.com/secret' } },
              ],
            }),
          ],
        },
      ],
    }
  );
  expect(documentWritingStatistics(content)).toEqual({
    words: 4,
    characters: 18,
    truncated: false,
  });
});
it('reports partial results at the depth boundary without mutating the source', () => {
  let content = text('hidden');
  for (let i = 0; i < 27; i++) content = doc(content);
  const original = JSON.stringify(content);
  expect(documentWritingStatistics(content)).toEqual({
    words: 0,
    characters: 0,
    truncated: true,
  });
  expect(JSON.stringify(content)).toBe(original);
});
it('bounds wide trees and identifies incomplete counts', () => {
  const content = doc(
    ...Array.from({ length: 20_001 }, () => paragraph(text('word')))
  );
  const counts = documentWritingStatistics(content);
  expect(counts.truncated).toBe(true);
  expect(counts.words).toBe(9999);
});
