import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  CITATION_LOCATOR_LABELS,
  CITATION_STYLE_IDS,
  type CitationLocator,
  type CitationNodeAttrs,
  type CitationSnapshot,
  type CitationStyleId,
  DEFAULT_CITATION_STYLE,
  type DocumentCitation,
} from './types';

export const CITATION_NODE_NAME = 'citation';
export const BIBLIOGRAPHY_NODE_NAME = 'citationBibliography';

const MAX_LOCATOR_LENGTH = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createCitationId(): string {
  return `cit_${globalThis.crypto.randomUUID()}`;
}

export function normalizeCitationStyle(value: unknown): CitationStyleId {
  return CITATION_STYLE_IDS.includes(value as CitationStyleId)
    ? (value as CitationStyleId)
    : DEFAULT_CITATION_STYLE;
}

export function normalizeLocator(value: unknown): CitationLocator | null {
  if (!isRecord(value)) return null;
  const label = value.label as CitationLocator['label'];
  const text =
    typeof value.value === 'string'
      ? value.value.trim().slice(0, MAX_LOCATOR_LENGTH)
      : '';
  if (!CITATION_LOCATOR_LABELS.includes(label) || !text) return null;
  return { label, value: text };
}

/**
 * Structural check only. The adapter validates the work itself; an unknown
 * snapshot shape is kept verbatim in the node attrs (never dropped) and reported
 * as invalid so the user can repair it.
 */
export function normalizeSnapshot(value: unknown): CitationSnapshot | null {
  if (!isRecord(value) || typeof value.capturedAt !== 'string') return null;
  if (
    value.kind === 'cite-work' &&
    typeof value.version === 'number' &&
    'work' in value
  ) {
    return {
      kind: 'cite-work',
      version: value.version,
      work: value.work,
      capturedAt: value.capturedAt,
      libraryVersion:
        typeof value.libraryVersion === 'number' ? value.libraryVersion : null,
    };
  }
  if (value.kind === 'legacy-fields' && 'fields' in value) {
    return {
      kind: 'legacy-fields',
      version: 1,
      fields: value.fields,
      capturedAt: value.capturedAt,
    };
  }
  return null;
}

/** Identity of one exact snapshot; repair state is bound to it. */
export function citationSnapshotKey(snapshot: CitationSnapshot): string {
  return JSON.stringify(snapshot);
}

export function readCitationAttrs(attrs: Record<string, unknown>) {
  return {
    citationId:
      typeof attrs.citationId === 'string' && attrs.citationId
        ? attrs.citationId
        : null,
    itemId:
      typeof attrs.itemId === 'string' && attrs.itemId ? attrs.itemId : null,
    snapshot: normalizeSnapshot(attrs.snapshot),
    locator: normalizeLocator(attrs.locator),
    suppressAuthor: attrs.suppressAuthor === true,
  };
}

/** Best-effort title from the stored snapshot, for plain-text and HTML fallbacks. */
export function snapshotTitle(snapshot: unknown): string | null {
  if (!isRecord(snapshot)) return null;
  const source = isRecord(snapshot.work)
    ? snapshot.work
    : isRecord(snapshot.fields)
      ? snapshot.fields
      : null;
  const title = source?.title;
  return typeof title === 'string' && title.trim() ? title.trim() : null;
}

export function citationFallbackText(attrs: Record<string, unknown>): string {
  const title = snapshotTitle(attrs.snapshot);
  return title ? `(${title})` : '(citation)';
}

export interface CollectedCitations {
  style: CitationStyleId;
  hasBibliography: boolean;
  citations: DocumentCitation[];
  /** Citations whose snapshot is structurally unreadable. */
  unreadableIds: string[];
}

/** Walks the document in order; the bibliography is derived from this list. */
export function collectDocumentCitations(
  doc: ProseMirrorNode
): CollectedCitations {
  let style: CitationStyleId | null = null;
  const citations: DocumentCitation[] = [];
  const unreadableIds: string[] = [];

  doc.descendants((node) => {
    if (node.type.name === BIBLIOGRAPHY_NODE_NAME) {
      style ??= normalizeCitationStyle(node.attrs.style);
      return false;
    }
    if (node.type.name !== CITATION_NODE_NAME) return true;
    const attrs = readCitationAttrs(node.attrs);
    if (!attrs.citationId) return false;
    if (!attrs.snapshot) {
      unreadableIds.push(attrs.citationId);
      return false;
    }
    citations.push({
      ...attrs,
      citationId: attrs.citationId,
      snapshot: attrs.snapshot,
    });
    return false;
  });

  return {
    style: style ?? DEFAULT_CITATION_STYLE,
    hasBibliography: style !== null,
    citations,
    unreadableIds,
  };
}

export function buildCitationAttrs(
  input: Pick<CitationNodeAttrs, 'itemId' | 'snapshot'> &
    Partial<Pick<CitationNodeAttrs, 'locator' | 'suppressAuthor'>>
): CitationNodeAttrs {
  return {
    citationId: createCitationId(),
    itemId: input.itemId,
    snapshot: input.snapshot,
    locator: input.locator ?? null,
    suppressAuthor: input.suppressAuthor ?? false,
  };
}
