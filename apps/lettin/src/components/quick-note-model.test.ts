import { expect, it } from 'vitest';
import { lettinDraftSchema } from '../server/schema';
import { quickNoteDraft } from './quick-note-model';

it('creates a schema-valid plain page preserving lines without interpreting links or markup', () => {
  const note = quickNoteDraft(
    '  Idea  ',
    '<script>x</script>\r\n\r\nhttps://example.test'
  );
  expect(lettinDraftSchema.parse(note)).toEqual(note);
  expect(note?.title).toBe('Idea');
  expect(note?.content.content).toEqual([
    {
      type: 'paragraph',
      content: [{ type: 'text', text: '<script>x</script>' }],
    },
    { type: 'paragraph', content: [] },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'https://example.test' }],
    },
  ]);
  expect(note).toMatchObject({ kind: 'page', links: [], tags: [], image: '' });
  expect(note).not.toHaveProperty('creationGuidance');
});
it('rejects missing text and out-of-bound input instead of silently truncating notes', () => {
  for (const [title, body] of [
    ['', 'Idea'],
    ['Name', '  '],
    ['x'.repeat(161), 'Idea'],
    ['Name', 'x'.repeat(10001)],
    ['Name', Array(101).fill('line').join('\n')],
  ])
    expect(quickNoteDraft(title!, body!)).toBeNull();
  expect(quickNoteDraft('x'.repeat(160), 'x'.repeat(10000))).not.toBeNull();
  expect(
    quickNoteDraft('Name', Array(100).fill('line').join('\n'))
  ).not.toBeNull();
});
