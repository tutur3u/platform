// @vitest-environment jsdom
import { Editor, generateHTML, generateJSON } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_CITATION_BYTES } from './citation-codec.js';
import {
  PassiveCitation,
  PassiveCitationBibliography,
} from './citation-extension.js';
import { markdownToJSON, jsonToMarkdown } from './codec.js';
import { RichTextEditor } from './react.js';
import type { JSONContent } from './types.js';

afterEach(cleanup);

const attrs = {
  citationId: 'cit_synthetic',
  itemId: null,
  snapshot: {
    kind: 'cite-work',
    version: 999,
    work: { title: 'Fictional rivers', future: { arbitrary: ['opaque'] } },
    capturedAt: '2026-11-16T00:00:00.000Z',
    libraryVersion: null,
  },
  locator: { label: 'page', value: '7' },
  suppressAuthor: true,
};
const content: JSONContent = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'citation', attrs }] },
    { type: 'citationBibliography', attrs: { style: 'harvard' } },
  ],
};
const extensions = [StarterKit, PassiveCitation, PassiveCitationBibliography];

describe('passive portable citation schemas', () => {
  it('loads Markdown-decoded citation nodes and roundtrips HTML snapshots', () => {
    const decoded = markdownToJSON(jsonToMarkdown(content));
    const html = generateHTML(decoded, extensions);
    expect(generateJSON(html, extensions)).toEqual(content);
  });

  it('preserves opaque snapshots when pasted into a non-citation editor', () => {
    const editor = new Editor({ extensions, content: '<p>Existing text</p>' });
    try {
      editor.commands.insertContent(generateHTML(content, extensions));
      const nodes: JSONContent[] = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'citation') nodes.push(node.toJSON());
      });
      expect(nodes).toEqual([{ type: 'citation', attrs }]);
    } finally {
      editor.destroy();
    }
  });

  it('treats hostile titles as inert text and rejects oversized HTML payloads', () => {
    const hostile = {
      ...attrs,
      snapshot: { work: { title: '<img src=x onerror=alert(1)>' } },
    };
    const html = generateHTML(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'citation', attrs: hostile }],
          },
        ],
      },
      extensions
    );
    const container = document.createElement('div');
    container.innerHTML = html;
    expect(container.querySelector('img')).toBeNull();
    expect(
      generateJSON(html, extensions).content?.[0]?.content?.[0]?.attrs?.snapshot
    ).toEqual(hostile.snapshot);
    const citation = document.createElement('cite');
    citation.setAttribute(
      'data-citation',
      JSON.stringify({
        snapshot: { work: { title: '界'.repeat(MAX_CITATION_BYTES / 2) } },
      })
    );
    citation.textContent = '(citation)';
    const parsed = generateJSON(`<p>${citation.outerHTML}</p>`, extensions);
    expect(
      parsed.content?.[0]?.content?.some(
        (node: JSONContent) => node.type === 'citation'
      )
    ).toBeFalsy();
  });

  for (const preset of ['compact', 'full', undefined] as const) {
    it(`registers passive nodes in the ${preset ?? 'legacy'} React editor`, async () => {
      const { container } = render(
        <RichTextEditor content={content} featurePreset={preset} />
      );
      await waitFor(() => {
        const citation = container.querySelector('cite[data-citation]');
        expect(citation?.textContent).toBe('(Fictional rivers)');
        expect(
          JSON.parse(citation?.getAttribute('data-citation') ?? '{}').snapshot
        ).toEqual(attrs.snapshot);
        expect(
          container
            .querySelector('section[data-citation-bibliography]')
            ?.getAttribute('data-style')
        ).toBe('harvard');
      });
    });
  }
});
