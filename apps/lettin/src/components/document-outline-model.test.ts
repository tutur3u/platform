import type { LettinNode } from '@tuturuuu/internal-api/lettin';
import { expect, it } from 'vitest';
import { buildDocumentOutline, outlineLimit } from './document-outline-model';

const heading = (text: string, level = 2): LettinNode => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
});
it('uses unique tree-position targets for repeated labels and repeated object references', () => {
  const same = heading('Repeated'),
    root = { type: 'doc', content: [same, same] };
  const outline = buildDocumentOutline(root, 'reader-one');
  expect(outline.items.map((i) => i.label)).toEqual(['Repeated', 'Repeated']);
  expect(new Set(outline.items.map((i) => i.id)).size).toBe(2);
  expect(outline.ids.get('0.0')).toBe(outline.items[0]!.id);
  expect(outline.ids.get('0.1')).toBe(outline.items[1]!.id);
  expect(buildDocumentOutline(root, 'reader-two').items[0]!.id).not.toBe(
    outline.items[0]!.id
  );
});
it('retains multilingual plain labels, collapses whitespace, skips empty headings and bounds levels', () => {
  const root = {
    type: 'doc',
    content: [
      heading('  '),
      heading(' Nhân vật\n mới ', 9),
      heading('<script>text</script>', 3),
    ],
  };
  const outline = buildDocumentOutline(root, 'reader');
  expect(outline.items.map((i) => i.label)).toEqual([
    'Nhân vật mới',
    '<script>text</script>',
  ]);
  expect(outline.items.map((i) => i.level)).toEqual([2, 3]);
  expect(outline.total).toBe(2);
});
it('does not use author-supplied IDs, link targets or image metadata as labels/targets', () => {
  const root = {
    type: 'doc',
    content: [
      {
        ...heading('Chapter'),
        attrs: { id: 'private-token', level: 1 },
        content: [
          {
            type: 'text',
            text: 'Chapter',
            marks: [
              { type: 'link', attrs: { href: 'https://example.com/private' } },
            ],
          },
        ],
      },
      {
        type: 'image',
        attrs: { alt: 'Private image', src: 'https://example.com/private' },
        content: [heading('Not rendered')],
      },
    ],
  };
  const outline = buildDocumentOutline(root, 'bad scope"><script>');
  expect(outline.items).toEqual([
    { id: 'lettin-document-section-0-0', label: 'Chapter', level: 1 },
  ]);
  expect(JSON.stringify(outline.items)).not.toContain('private');
});
it('discovers headings inside details and tables with paths matching renderer traversal', () => {
  const root = {
    type: 'doc',
    content: [
      {
        type: 'details',
        content: [
          { type: 'detailsSummary', content: [{ type: 'text', text: 'Fold' }] },
          { type: 'detailsContent', content: [heading('Hidden section')] },
        ],
      },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [heading('Cell section')] },
            ],
          },
        ],
      },
    ],
  };
  const outline = buildDocumentOutline(root, 'reader');
  expect([...outline.ids.keys()]).toEqual(['0.0.1.0', '0.1.0.0.0']);
});
it('limits navigation entries while reporting truncation without mutating documents', () => {
  const root = {
      type: 'doc',
      content: Array.from({ length: outlineLimit + 5 }, (_, i) =>
        heading(`Section ${i}`)
      ),
    },
    before = JSON.stringify(root);
  const outline = buildDocumentOutline(root, 'reader');
  expect(outline.items).toHaveLength(outlineLimit);
  expect(outline.total).toBe(outlineLimit + 5);
  expect(outline.truncated).toBe(true);
  expect(outline.ids.size).toBe(outlineLimit);
  expect(JSON.stringify(root)).toBe(before);
});
it('bounds deep traversal and label length', () => {
  let root: LettinNode = heading('Hidden');
  for (let i = 0; i < 27; i++) root = { type: 'doc', content: [root] };
  expect(buildDocumentOutline(root, 'reader').items).toEqual([]);
  expect(
    buildDocumentOutline(
      { type: 'doc', content: [heading('x'.repeat(500))] },
      'reader'
    ).items[0]!.label
  ).toHaveLength(160);
});

it('matches rendered heading text across hard breaks and ignored image children', () => {
  const root: LettinNode = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [
          { type: 'text', text: 'First' },
          { type: 'hardBreak' },
          { type: 'text', text: 'Second' },
          {
            type: 'image',
            content: [{ type: 'text', text: 'Unrendered image child' }],
          },
        ],
      },
    ],
  };
  expect(buildDocumentOutline(root, 'reader').items[0]!.label).toBe(
    'First Second'
  );
});
it('excludes label text beyond the renderer global depth limit', () => {
  let node: LettinNode = {
    type: 'heading',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Unrendered too deep' }],
      },
    ],
  };
  for (let i = 0; i < 24; i++) node = { type: 'doc', content: [node] };
  expect(buildDocumentOutline(node, 'reader').items).toEqual([]);
});
