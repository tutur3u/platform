import { Node } from '@tiptap/core';
import {
  boundedCitationAttrs,
  citationFallbackText,
  MAX_CITATION_BYTES,
} from './citation-codec.js';

function parseCitationElement(element: HTMLElement) {
  const raw = element.getAttribute('data-citation');
  if (!raw || raw.length > MAX_CITATION_BYTES) return false;
  try {
    const value: unknown = JSON.parse(raw);
    return boundedCitationAttrs(value) ?? false;
  } catch {
    return false;
  }
}

const opaqueAttribute = (value: unknown) => ({
  default: value,
  rendered: false,
});

/** Passive schema support keeps snapshots editable without a citation engine. */
export const PassiveCitation = Node.create({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      citationId: opaqueAttribute(null),
      itemId: opaqueAttribute(null),
      snapshot: opaqueAttribute(null),
      locator: opaqueAttribute(null),
      suppressAuthor: opaqueAttribute(false),
    };
  },

  parseHTML() {
    return [{ tag: 'cite[data-citation]', getAttrs: parseCitationElement }];
  },

  renderHTML({ node }) {
    const attrs = boundedCitationAttrs(node.attrs) ?? { snapshot: null };
    return [
      'cite',
      { 'data-citation': JSON.stringify(attrs) },
      citationFallbackText(attrs),
    ];
  },

  renderText({ node }) {
    return citationFallbackText(node.attrs);
  },
});

/** The bibliography stores a style; reference content belongs to the host. */
export const PassiveCitationBibliography = Node.create({
  name: 'citationBibliography',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      style: {
        default: 'apa',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-style') === 'harvard' ? 'harvard' : 'apa',
        renderHTML: (attrs: Record<string, unknown>) => ({
          'data-style': attrs.style === 'harvard' ? 'harvard' : 'apa',
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-citation-bibliography]' }];
  },

  renderHTML({ node }) {
    return [
      'section',
      {
        'data-citation-bibliography': '',
        'data-style': node.attrs.style === 'harvard' ? 'harvard' : 'apa',
      },
      '(references)',
    ];
  },

  renderText() {
    return '(references)';
  },
});
