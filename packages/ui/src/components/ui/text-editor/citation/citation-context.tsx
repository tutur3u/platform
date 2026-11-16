'use client';

import type { Editor } from '@tiptap/react';
import { createContext, useContext } from 'react';
import type { CitationLabels } from './labels';
import type {
  CitationAdapter,
  CitationLibraryItem,
  CitationNodeAttrs,
  CitationRecovery,
  CitationRepair,
  CitationResult,
  CitationSnapshot,
  CitationSnapshotInspection,
  CitationStyleId,
  FormattedDocumentCitations,
} from './types';

export type CitationFormatState =
  | { status: 'ok'; result: FormattedDocumentCitations }
  | { status: 'error' };

export type CitationLibraryState =
  | { status: 'none' }
  | { status: 'pending' }
  | {
      status: 'settled';
      result: CitationResult<{
        items: CitationLibraryItem[];
        missingIds: string[];
      }>;
    }
  | { status: 'failed' };

/** Where the drawer applies the chosen source. */
export type CitationDrawerTarget =
  | { mode: 'insert'; pos: number }
  | { mode: 'replace'; citationId: string };

export interface CitationContextValue {
  editor: Editor;
  adapter: CitationAdapter;
  labels: CitationLabels;
  style: CitationStyleId;
  format: CitationFormatState;
  inspect: (snapshot: CitationSnapshot) => CitationSnapshotInspection;
  library: CitationLibraryState;
  openDrawer: (target: CitationDrawerTarget) => void;
  setStyle: (style: CitationStyleId) => void;
  /**
   * AI repair sessions keyed by the exact snapshot they were started from, kept
   * for the editor's lifetime. Closing and reopening the popover reuses the
   * operation id and any unapplied proposal instead of starting a paid request.
   */
  repairSessions: Map<string, CitationRepairSession>;
  /**
   * Raw reference whose repair session is still open, so reopening the drawer
   * resumes that exact input instead of an empty capture field.
   */
  rawRepairInput: { current: string | null };
}

export interface CitationRepairSession {
  operationId: string;
  /** Reviewed-but-unapplied result; cleared only by Apply or Discard. */
  proposal: CitationRepair | null;
}

export const CitationContext = createContext<CitationContextValue | null>(null);

/** Null outside an opted-in editor; node views then render the stored snapshot. */
export function useCitationContext() {
  return useContext(CitationContext);
}

/**
 * Validation state shown beside recovery. Independent of the library: a linked
 * citation can still miss a style-required field, and the snapshot is kept.
 */
export function citationValidationLevel(
  inspection: CitationSnapshotInspection | null
): 'error' | 'warning' | null {
  if (inspection?.status !== 'valid') return null;
  if (inspection.issues.some((issue) => issue.severity === 'error')) {
    return 'error';
  }
  return inspection.issues.length ? 'warning' : null;
}

export function resolveCitationRecovery(
  attrs: Pick<CitationNodeAttrs, 'itemId' | 'snapshot'>,
  inspection: CitationSnapshotInspection | null,
  library: CitationLibraryState
): CitationRecovery {
  if (!attrs.snapshot || inspection?.status === 'invalid') {
    return { kind: 'invalid' };
  }
  if (!attrs.itemId) return { kind: 'unlinked' };
  switch (library.status) {
    case 'none':
    case 'failed':
      return { kind: 'library-unavailable' };
    case 'pending':
      return { kind: 'checking' };
    case 'settled': {
      if (library.result.status !== 'ok') {
        return { kind: 'library-unavailable' };
      }
      const { items, missingIds } = library.result.data;
      if (missingIds.includes(attrs.itemId)) return { kind: 'detached' };
      const item = items.find((entry) => entry.id === attrs.itemId);
      if (!item) return { kind: 'library-unavailable' };
      const stored =
        attrs.snapshot.kind === 'cite-work'
          ? attrs.snapshot.libraryVersion
          : null;
      return stored === null || item.version > stored
        ? { kind: 'update-available', item }
        : { kind: 'linked' };
    }
  }
}
