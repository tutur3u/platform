import { Extension, InputRule, mergeAttributes, Node } from '@tiptap/core';
import {
  type EditorState,
  Plugin,
  PluginKey,
  type Transaction,
} from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { BibliographyNodeView } from './bibliography-node-view';
import { boundedCitationAttrs, exceedsCitationBytes } from './citation-bounds';
import { CitationNodeView } from './citation-node-view';
import {
  BIBLIOGRAPHY_NODE_NAME,
  CITATION_NODE_NAME,
  citationFallbackText,
  createCitationId,
  normalizeCitationStyle,
} from './snapshot';

function parseCitationElement(element: HTMLElement) {
  const raw = element.getAttribute('data-citation');
  // Oversized or too-deep payloads are ignored rather than parsed.
  if (!raw || exceedsCitationBytes(raw)) return false;
  try {
    const attrs = boundedCitationAttrs(JSON.parse(raw));
    if (!attrs) return false;
    return {
      citationId:
        typeof attrs.citationId === 'string' ? attrs.citationId : null,
      itemId: typeof attrs.itemId === 'string' ? attrs.itemId : null,
      snapshot: attrs.snapshot ?? null,
      locator: attrs.locator ?? null,
      suppressAuthor: attrs.suppressAuthor === true,
    };
  } catch {
    return false;
  }
}

const unrendered = (fallback: unknown) => ({
  default: fallback,
  rendered: false,
});

const citationIdKey = new PluginKey('citationIds');
const bibliographyKey = new PluginKey('citationBibliography');

/**
 * Keeps one references block per document. Pasting cited content can bring its
 * own block; the block that already existed survives with the document's chosen
 * style and the extras are removed. It runs as an appended transaction, so one
 * undo reverts the paste and this cleanup together.
 */
export function normalizeBibliographyBlocks(
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState
): Transaction | null {
  if (!transactions.some((tr) => tr.docChanged)) return null;
  const blocks: { pos: number; size: number; style: unknown }[] = [];
  newState.doc.descendants((node, pos) => {
    if (node.type.name !== BIBLIOGRAPHY_NODE_NAME) return true;
    blocks.push({ pos, size: node.nodeSize, style: node.attrs.style });
    return false;
  });
  if (blocks.length < 2) return null;

  let original: { pos: number; style: unknown } | null = null;
  oldState.doc.descendants((node, pos) => {
    if (original) return false;
    if (node.type.name !== BIBLIOGRAPHY_NODE_NAME) return true;
    original = { pos, style: node.attrs.style };
    return false;
  });
  const before = original as { pos: number; style: unknown } | null;

  let keep = blocks[0];
  if (before) {
    let mapped: number | null = before.pos;
    for (const tr of transactions) {
      if (mapped === null) break;
      const result = tr.mapping.mapResult(mapped, 1);
      mapped = result.deleted ? null : result.pos;
    }
    keep = blocks.find((block) => block.pos === mapped) ?? keep;
  }
  if (!keep) return null;

  const tr = newState.tr;
  for (const block of [...blocks].reverse()) {
    if (block === keep) continue;
    try {
      tr.delete(block.pos, block.pos + block.size);
    } catch {
      // A block that is the only allowed child of its parent stays in place.
    }
  }
  if (before) {
    const style = normalizeCitationStyle(before.style);
    const pos = tr.mapping.map(keep.pos);
    if (normalizeCitationStyle(tr.doc.nodeAt(pos)?.attrs.style) !== style) {
      tr.setNodeAttribute(pos, 'style', style);
    }
  }
  return tr.docChanged ? tr : null;
}

/**
 * Inline citation atom. Its attrs carry a self-contained snapshot, so the node is
 * always renderable and survives library deletes, offline use and stale sources.
 * It is registered in every rich text editor so cited documents are never
 * flattened, even where citation insertion is not enabled.
 */
export const CitationNode = Node.create({
  name: CITATION_NODE_NAME,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      citationId: unrendered(null),
      itemId: unrendered(null),
      snapshot: unrendered(null),
      locator: unrendered(null),
      suppressAuthor: unrendered(false),
    };
  },

  parseHTML() {
    return [{ tag: 'cite[data-citation]', getAttrs: parseCitationElement }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'cite',
      mergeAttributes(HTMLAttributes, {
        'data-citation': JSON.stringify(node.attrs),
      }),
      citationFallbackText(node.attrs),
    ];
  },

  renderText({ node }) {
    return citationFallbackText(node.attrs);
  },

  addNodeView() {
    return ReactNodeViewRenderer(CitationNodeView, { as: 'span' });
  },

  addProseMirrorPlugins() {
    const type = this.name;
    return [
      new Plugin({
        key: citationIdKey,
        // Copy/paste duplicates a citation's id; give each instance its own so
        // locators and suppress-author stay per placement.
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const seen = new Set<string>();
          const tr = state.tr;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== type) return true;
            const id = node.attrs.citationId;
            if (typeof id === 'string' && id && !seen.has(id)) {
              seen.add(id);
              return false;
            }
            tr.setNodeAttribute(pos, 'citationId', createCitationId());
            return false;
          });
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});

/** Derived reference list. Stores only the document citation style. */
export const BibliographyNode = Node.create({
  name: BIBLIOGRAPHY_NODE_NAME,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      style: {
        default: 'apa',
        parseHTML: (element: HTMLElement) =>
          normalizeCitationStyle(element.getAttribute('data-style')),
        renderHTML: (attrs: Record<string, unknown>) => ({
          'data-style': normalizeCitationStyle(attrs.style),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-citation-bibliography]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(HTMLAttributes, { 'data-citation-bibliography': '' }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BibliographyNodeView);
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: bibliographyKey,
        appendTransaction: normalizeBibliographyBlocks,
      }),
    ];
  },
});

export interface CitationKitStorage {
  /** Set by the citation layer; opens the insert drawer at the selection. */
  requestInsert: (() => void) | null;
}

declare module '@tiptap/core' {
  interface Storage {
    citationKit: CitationKitStorage;
  }
}

export const CITATION_INSERT_SHORTCUT = 'Mod-Alt-c';

/** Opt-in insertion triggers: `/cite` + space and the keyboard shortcut. */
export const CitationKit = Extension.create<object, CitationKitStorage>({
  name: 'citationKit',

  addStorage() {
    return { requestInsert: null };
  },

  addKeyboardShortcuts() {
    return {
      [CITATION_INSERT_SHORTCUT]: () => {
        if (!this.editor.isEditable || !this.storage.requestInsert) {
          return false;
        }
        this.storage.requestInsert();
        return true;
      },
    };
  },

  addInputRules() {
    const storage = this.storage;
    return [
      new InputRule({
        find: /(^|\s)\/cite\s$/,
        handler: ({ range, match, chain }) => {
          if (!storage.requestInsert) return null;
          chain()
            .deleteRange({
              from: range.from + (match[1]?.length ?? 0),
              to: range.to,
            })
            .run();
          storage.requestInsert();
        },
      }),
    ];
  },
});
