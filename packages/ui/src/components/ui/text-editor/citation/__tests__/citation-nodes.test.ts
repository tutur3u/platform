import { Editor, generateHTML, generateJSON } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../../extensions';
import { insertCitation, setCitationStyle } from '../citation-commands';
import { resolveCitationRecovery } from '../citation-context';
import { BibliographyNode, CitationNode } from '../citation-nodes';
import { collectDocumentCitations } from '../snapshot';
import type { CitationSnapshot } from '../types';

const snapshot: CitationSnapshot = {
  kind: 'cite-work',
  version: 1,
  work: { id: 'w', type: 'book', title: 'Synthetic Fieldwork' },
  capturedAt: '2026-11-16T00:00:00.000Z',
  libraryVersion: 2,
};

const citationJson = (citationId: string, extra = {}) => ({
  type: 'citation',
  attrs: {
    citationId,
    itemId: 'item-1',
    snapshot,
    locator: { label: 'page', value: '12' },
    suppressAuthor: true,
    ...extra,
  },
});

const doc = (...inline: object[]) => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'As shown ' }, ...inline],
    },
    { type: 'citationBibliography', attrs: { style: 'harvard' } },
  ],
});

/** Schema-only node set: node views need a React renderer. */
const schemaExtensions = [
  StarterKit,
  CitationNode.extend({ addNodeView: null }),
  BibliographyNode.extend({ addNodeView: null }),
];

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('citation nodes', () => {
  it('registers citation schema in every editor and insertion triggers only on opt-in', () => {
    const names = (options: Parameters<typeof getEditorExtensions>[0]) =>
      getEditorExtensions(options).map((extension) => extension.name);

    expect(names({})).toEqual(
      expect.arrayContaining(['citation', 'citationBibliography'])
    );
    expect(names({})).not.toContain('citationKit');
    expect(names({ citations: true })).toContain('citationKit');
    expect(names({ citations: true, readOnly: true })).not.toContain(
      'citationKit'
    );
  });

  it('round-trips snapshots, locators and style through HTML', () => {
    const html = generateHTML(doc(citationJson('cit_a')), schemaExtensions);
    expect(html).toContain('(Synthetic Fieldwork)');
    const json = generateJSON(html, schemaExtensions);
    const paragraph = json.content[0].content;
    expect(paragraph[1]).toEqual(citationJson('cit_a'));
    expect(json.content[1].attrs.style).toBe('harvard');
  });

  it('keeps an unreadable snapshot verbatim instead of dropping the node', () => {
    editor = new Editor({
      extensions: schemaExtensions,
      content: doc(citationJson('cit_bad', { snapshot: { kind: 'future' } })),
    });
    const node = editor.getJSON().content?.[0]?.content?.[1];
    expect(node?.type).toBe('citation');
    expect(node && 'attrs' in node ? node.attrs?.snapshot : undefined).toEqual({
      kind: 'future',
    });
    expect(collectDocumentCitations(editor.state.doc).unreadableIds).toEqual([
      'cit_bad',
    ]);
  });

  it('collects citations in document order with the document style', () => {
    editor = new Editor({
      extensions: schemaExtensions,
      content: doc(citationJson('cit_a'), citationJson('cit_b')),
    });
    const collected = collectDocumentCitations(editor.state.doc);
    expect(collected.style).toBe('harvard');
    expect(collected.hasBibliography).toBe(true);
    expect(collected.citations.map((entry) => entry.citationId)).toEqual([
      'cit_a',
      'cit_b',
    ]);
    expect(collected.citations[0]?.locator).toEqual({
      label: 'page',
      value: '12',
    });
  });

  it('gives pasted duplicates their own citation id', () => {
    editor = new Editor({ extensions: schemaExtensions, content: doc() });
    editor.commands.insertContentAt(1, [
      citationJson('cit_a'),
      citationJson('cit_a'),
    ]);
    const ids = collectDocumentCitations(editor.state.doc).citations.map(
      (entry) => entry.citationId
    );
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain('cit_a');
  });

  it('inserts a references block once and switches style in place', () => {
    editor = new Editor({
      extensions: schemaExtensions,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    insertCitation(editor, { pos: 1, itemId: null, snapshot }, 'apa');
    insertCitation(editor, { pos: 1, itemId: null, snapshot }, 'apa');
    setCitationStyle(editor, 'harvard');
    const json = editor.getJSON();
    const blocks = json.content?.filter(
      (node) => node.type === 'citationBibliography'
    );
    expect(blocks).toHaveLength(1);
    expect(blocks?.[0]?.attrs?.style).toBe('harvard');
    expect(collectDocumentCitations(editor.state.doc).citations).toHaveLength(
      2
    );
  });
});

describe('resolveCitationRecovery', () => {
  const linked = { itemId: 'item-1', snapshot };
  const valid = {
    status: 'valid' as const,
    summary: { title: 't', contributors: '', year: null },
    issues: [],
  };
  const settled = (
    items: { id: string; version: number }[],
    missingIds: string[] = []
  ) => ({
    status: 'settled' as const,
    result: {
      status: 'ok' as const,
      data: {
        items: items.map((item) => ({
          ...item,
          work: {},
          summary: valid.summary,
          updatedAt: '',
        })),
        missingIds,
      },
    },
  });

  it('prioritises invalid snapshots', () => {
    expect(
      resolveCitationRecovery(
        linked,
        { status: 'invalid', summary: null },
        settled([])
      )
    ).toEqual({ kind: 'invalid' });
  });

  it('keeps detached citations rendering from the snapshot', () => {
    expect(
      resolveCitationRecovery(linked, valid, settled([], ['item-1']))
    ).toEqual({
      kind: 'detached',
    });
  });

  it('reports unchecked linked sources as unavailable after a bounded batch', () => {
    expect(resolveCitationRecovery(linked, valid, settled([]))).toEqual({
      kind: 'library-unavailable',
    });
  });

  it('offers an update only for a newer library version', () => {
    expect(
      resolveCitationRecovery(
        linked,
        valid,
        settled([{ id: 'item-1', version: 2 }])
      ).kind
    ).toBe('linked');
    expect(
      resolveCitationRecovery(
        linked,
        valid,
        settled([{ id: 'item-1', version: 3 }])
      ).kind
    ).toBe('update-available');
  });

  it('reports an unavailable library without blocking the citation', () => {
    expect(
      resolveCitationRecovery(linked, valid, { status: 'none' }).kind
    ).toBe('library-unavailable');
    expect(
      resolveCitationRecovery(linked, valid, {
        status: 'settled',
        result: { status: 'unavailable', reason: 'not_provisioned' },
      }).kind
    ).toBe('library-unavailable');
    expect(
      resolveCitationRecovery({ itemId: null, snapshot }, valid, {
        status: 'none',
      }).kind
    ).toBe('unlinked');
  });
});
