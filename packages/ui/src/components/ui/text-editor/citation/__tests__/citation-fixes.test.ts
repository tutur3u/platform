import { Editor, generateHTML } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { applyRepairedSnapshot, updateCitation } from '../citation-commands';
import { MAX_CITATION_BYTES } from '../citation-bounds';
import { BibliographyNode, CitationNode } from '../citation-nodes';
import { classifyRepairFailure } from '../label-keys';
import {
  citationSnapshotKey,
  collectDocumentCitations,
  normalizeSnapshot,
} from '../snapshot';
import type { CitationSnapshot } from '../types';

const snapshot = (title: string, libraryVersion = 1): CitationSnapshot => ({
  kind: 'cite-work',
  version: 1,
  work: { id: 'w', type: 'book', title },
  capturedAt: '2026-11-16T00:00:00.000Z',
  libraryVersion,
});

const citation = (citationId: string, title = 'Synthetic Fieldwork') => ({
  type: 'citation',
  attrs: {
    citationId,
    itemId: null,
    snapshot: snapshot(title),
    locator: null,
    suppressAuthor: false,
  },
});

const schemaExtensions = [
  StarterKit,
  CitationNode.extend({ addNodeView: null }),
  BibliographyNode.extend({ addNodeView: null }),
];

/** jsdom has no ClipboardEvent constructor; ProseMirror still handles the paste. */
class PasteEvent extends Event implements ClipboardEvent {
  readonly clipboardData = null;
}

function pasteHtml(instance: Editor, html: string) {
  return instance.view.pasteHTML(html, new PasteEvent('paste'));
}

const bibliographies = (instance: Editor) =>
  (instance.getJSON().content ?? []).filter(
    (node) => node.type === 'citationBibliography'
  );

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('pasting cited content', () => {
  const original = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Intro ' }, citation('cit_a')],
      },
      { type: 'citationBibliography', attrs: { style: 'apa' } },
    ],
  };
  const pasted = generateHTML(
    {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Copied ' },
            citation('cit_b', 'Other Sample'),
          ],
        },
        { type: 'citationBibliography', attrs: { style: 'harvard' } },
      ],
    },
    schemaExtensions
  );

  it('keeps the existing references block and the document style', () => {
    editor = new Editor({ extensions: schemaExtensions, content: original });
    editor.commands.setTextSelection(3);
    pasteHtml(editor, pasted);

    const blocks = bibliographies(editor);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.attrs?.style).toBe('apa');
    expect(editor.getJSON().content?.at(-1)?.type).toBe('citationBibliography');
    expect(collectDocumentCitations(editor.state.doc).citations).toHaveLength(
      2
    );
  });

  it('reverts the paste and its cleanup with one undo', () => {
    editor = new Editor({ extensions: schemaExtensions, content: original });
    const before = editor.getJSON();
    editor.commands.setTextSelection(3);
    pasteHtml(editor, pasted);
    expect(bibliographies(editor)).toHaveLength(1);

    editor.commands.undo();
    expect(editor.getJSON()).toEqual(before);
  });

  it('keeps a pasted references block when the document had none', () => {
    editor = new Editor({
      extensions: schemaExtensions,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    pasteHtml(editor, pasted);
    const blocks = bibliographies(editor);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.attrs?.style).toBe('harvard');
  });

  it('ignores citation payloads over the UTF-8 byte bound', () => {
    editor = new Editor({
      extensions: schemaExtensions,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    // Under the bound in UTF-16 code units, over it in UTF-8 bytes.
    const title = '界'.repeat(Math.ceil(MAX_CITATION_BYTES / 3) + 10);
    const attrs = JSON.stringify(citation('cit_big', title).attrs);
    expect(attrs.length).toBeLessThan(MAX_CITATION_BYTES);
    pasteHtml(
      editor,
      `<p><cite data-citation="${attrs.replaceAll('"', '&quot;')}">(x)</cite></p>`
    );
    expect(collectDocumentCitations(editor.state.doc).citations).toHaveLength(
      0
    );
  });
});

describe('applying a reviewed repair', () => {
  const doc = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [citation('cit_a', 'Draft')] }],
  };
  const baseKey = () => {
    const base = normalizeSnapshot(snapshot('Draft'));
    if (!base) throw new Error('fixture must be readable');
    return citationSnapshotKey(base);
  };

  it('applies while the citation still holds the repaired snapshot', () => {
    editor = new Editor({ extensions: schemaExtensions, content: doc });
    expect(
      applyRepairedSnapshot(editor, 'cit_a', baseKey(), snapshot('Repaired'))
    ).toBe(true);
    const [placed] = collectDocumentCitations(editor.state.doc).citations;
    expect(placed?.snapshot).toEqual(snapshot('Repaired'));
  });

  it('rejects a proposal once the snapshot changed underneath it', () => {
    editor = new Editor({ extensions: schemaExtensions, content: doc });
    const key = baseKey();
    updateCitation(editor, 'cit_a', { snapshot: snapshot('From library', 2) });
    expect(
      applyRepairedSnapshot(editor, 'cit_a', key, snapshot('Repaired'))
    ).toBe(false);
    const [placed] = collectDocumentCitations(editor.state.doc).citations;
    expect(placed?.snapshot).toEqual(snapshot('From library', 2));
  });
});

describe('repair failure states', () => {
  it('never asks for a new operation while settlement is unknown', () => {
    expect(
      classifyRepairFailure({ status: 'error', code: 'BILLING_PENDING' })
    ).toEqual({ kind: 'billingPending', retry: 'same' });
    expect(
      classifyRepairFailure({
        status: 'error',
        code: 'UPSTREAM_ERROR',
        billing: 'unknown',
      })
    ).toEqual({ kind: 'billingPending', retry: 'same' });
    expect(
      classifyRepairFailure({ status: 'error', code: 'GENERATION_IN_PROGRESS' })
    ).toEqual({ kind: 'inProgress', retry: 'same' });
  });

  it('reports a charged invalid result and only then allows a new request', () => {
    expect(
      classifyRepairFailure({ status: 'error', code: 'INVALID_AI_OUTPUT' })
    ).toEqual({ kind: 'chargedInvalid', retry: 'new' });
  });

  it('maps credit and access failures without inventing a retry', () => {
    expect(
      classifyRepairFailure({
        status: 'unavailable',
        reason: 'insufficient_credits',
      })
    ).toEqual({ kind: 'creditsExhausted', retry: 'new' });
    expect(
      classifyRepairFailure({ status: 'unavailable', reason: 'forbidden' })
    ).toEqual({ kind: 'notAllowed', retry: 'none' });
    expect(
      classifyRepairFailure({ status: 'error', code: 'AI_UNAVAILABLE' })
    ).toEqual({ kind: 'unavailable', retry: 'same' });
  });
});
