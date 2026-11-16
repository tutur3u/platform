import { describe, expect, it } from 'vitest';
import {
  boundedCitationAttrs,
  MAX_CITATION_BYTES,
  parseCitationHTML,
  renderCitationHTML,
} from './citation-codec.js';
import { extractPlainText, jsonToMarkdown, markdownToJSON } from './codec.js';
import { renderRichTextToHTML, sanitizeRichTextContent } from './render.js';
import type { JSONContent } from './types.js';

const attrs = {
  citationId: 'cit_synthetic',
  itemId: null,
  snapshot: {
    kind: 'cite-work',
    version: 999,
    work: {
      title: 'Fictional stars & rivers',
      futureField: {
        edition: 3,
        path: 'C:\\fiction\\river',
        punctuation: '*_[x]',
      },
    },
    capturedAt: '2026-11-16T00:00:00.000Z',
    libraryVersion: null,
  },
  locator: { label: 'page', value: '12' },
  suppressAuthor: false,
};
const citation: JSONContent = { type: 'citation', attrs };
const bibliography: JSONContent = {
  type: 'citationBibliography',
  attrs: { style: 'harvard' },
};
const document: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [citation] }, bibliography],
};

describe('portable citation preservation', () => {
  it('keeps unknown snapshot versions and opaque future fields under every preset', () => {
    for (const featurePreset of ['compact', 'full'] as const) {
      expect(sanitizeRichTextContent(document, { featurePreset })).toEqual(
        document
      );
    }
    expect(sanitizeRichTextContent(document)).toEqual(document);
  });

  it('roundtrips inline snapshots and bibliography style through Markdown HTML', () => {
    expect(markdownToJSON(jsonToMarkdown(document))).toEqual(document);
  });

  it('roundtrips rendered citation HTML without interpreting the work schema', () => {
    const html = renderRichTextToHTML({ type: 'doc', content: [citation] });
    expect(parseCitationHTML(html)).toEqual(citation);
    expect(parseCitationHTML(renderCitationHTML(bibliography) ?? '')).toEqual(
      bibliography
    );
  });

  it('escapes hostile metadata and preserves the original inert JSON on reimport', () => {
    const hostile = {
      ...attrs,
      snapshot: { work: { title: '"><img src=x onerror=alert(1)> &quot;' } },
    };
    const html = renderCitationHTML({ type: 'citation', attrs: hostile }) ?? '';
    expect(html).not.toContain('<img');
    expect(parseCitationHTML(html)?.attrs).toEqual(hostile);
  });

  it('uses readable title fallbacks rather than erasing citation atoms', () => {
    expect(extractPlainText(document)).toBe(
      '(Fictional stars & rivers)\n(references)'
    );
    const legacy = {
      type: 'citation',
      attrs: { snapshot: { fields: { title: 'Synthetic legacy book' } } },
    };
    expect(extractPlainText({ type: 'doc', content: [legacy] })).toBe(
      '(Synthetic legacy book)'
    );
  });

  it('retains citations and bibliography from unsupported containers', () => {
    const nested: JSONContent = {
      type: 'doc',
      content: [
        { type: 'unknownContainer', content: [citation, bibliography] },
      ],
    };
    const safe = sanitizeRichTextContent(nested);
    expect(extractPlainText(safe)).toContain('(Fictional stars & rivers)');
    expect(safe?.content).toContainEqual(bibliography);
  });

  it('rejects byte-heavy or cyclic payloads and retains a recovery atom', () => {
    const oversized = {
      snapshot: { title: '界'.repeat(MAX_CITATION_BYTES / 2) },
    };
    expect(boundedCitationAttrs(oversized)).toBeNull();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(boundedCitationAttrs(cycle)).toBeNull();
    expect(
      sanitizeRichTextContent({
        type: 'doc',
        content: [{ type: 'citation', attrs: oversized }],
      })?.content?.[0]?.type
    ).toBe('citation');
    expect(
      parseCitationHTML('<cite data-citation="{broken}">fallback</cite>')
    ).toBeNull();
  });
});
