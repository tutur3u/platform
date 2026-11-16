import type { ReactNode } from 'react';

/**
 * Editor-facing citation contract. The shared editor never formats or validates
 * citations itself: the host injects a {@link CitationAdapter} so the shared UI
 * entry stays free of the citation engine and app-only modules. Works are opaque
 * here (`unknown`); the adapter owns their schema.
 */

export const CITATION_STYLE_IDS = ['apa', 'harvard'] as const;
export type CitationStyleId = (typeof CITATION_STYLE_IDS)[number];
export const DEFAULT_CITATION_STYLE: CitationStyleId = 'apa';

export const CITATION_LOCATOR_LABELS = [
  'page',
  'chapter',
  'section',
  'paragraph',
  'figure',
  'table',
  'line',
] as const;
export type CitationLocatorLabel = (typeof CITATION_LOCATOR_LABELS)[number];

export interface CitationLocator {
  label: CitationLocatorLabel;
  value: string;
}

/**
 * Self-contained copy of the cited work stored in the document JSON. It keeps the
 * citation renderable after the library item is deleted, offline, or changed.
 */
export type CitationSnapshot =
  | {
      kind: 'cite-work';
      version: number;
      work: unknown;
      capturedAt: string;
      /** Library item version the snapshot was taken from, if linked. */
      libraryVersion: number | null;
    }
  | {
      kind: 'legacy-fields';
      version: 1;
      fields: unknown;
      capturedAt: string;
    };

export interface CitationNodeAttrs {
  citationId: string;
  /** Library link only; rendering never depends on it. */
  itemId: string | null;
  snapshot: CitationSnapshot | null;
  locator: CitationLocator | null;
  suppressAuthor: boolean;
}

/** One citation as it appears in document order. */
export interface DocumentCitation {
  citationId: string;
  itemId: string | null;
  snapshot: CitationSnapshot;
  locator: CitationLocator | null;
  suppressAuthor: boolean;
}

export interface CitationWorkSummary {
  title: string;
  contributors: string;
  year: string | null;
}

/**
 * One styled run of formatter output. The editor renders runs as React text and
 * marks, never as HTML, so required italics survive without injection risk.
 */
export interface CitationFormattedRun {
  text: string;
  italic?: true;
  bold?: true;
  vertical?: 'superscript' | 'subscript';
  href?: string;
}

export interface FormattedDocumentCitations {
  inText: Record<string, string>;
  bibliography: {
    key: string;
    /** Plain text for clipboard and accessibility callers. */
    text: string;
    /** Styled runs; renderers fall back to `text` when absent. */
    runs?: CitationFormattedRun[];
    citationIds: string[];
  }[];
  issues: { citationId: string; code: string }[];
}

export interface CitationValidationIssue {
  field: string;
  severity: 'error' | 'warning';
}

export type CitationSnapshotInspection =
  | {
      status: 'valid';
      summary: CitationWorkSummary;
      issues: CitationValidationIssue[];
    }
  | { status: 'invalid'; summary: CitationWorkSummary | null };

export type CitationUnavailableReason =
  | 'not_provisioned'
  | 'forbidden'
  | 'offline'
  | 'insufficient_credits';

/**
 * Settlement of a billed call that failed: `unknown` means the charge may still
 * complete (retry with the same operation id), `settled` means it was charged.
 */
export type CitationBillingStatus = 'unknown' | 'settled';

/** Typed result of every host call; the editor never invents product data. */
export type CitationResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'unavailable'; reason: CitationUnavailableReason }
  | { status: 'error'; code: string; billing?: CitationBillingStatus };

export interface CitationLibraryItem {
  id: string;
  version: number;
  work: unknown;
  summary: CitationWorkSummary;
  updatedAt: string;
  /** Library tags; carried unchanged through edits so they are never erased. */
  tags?: string[];
}

export interface CitationCandidate {
  work: unknown;
  summary: CitationWorkSummary;
}

/**
 * Capture output: one validated work, up to three candidates (never
 * auto-selected), or an incomplete manual draft the person must finish.
 */
export type CitationCapture =
  | { kind: 'captured'; candidate: CitationCandidate }
  | { kind: 'candidates'; candidates: CitationCandidate[] }
  | { kind: 'manual'; draft: unknown };

export interface CitationManualEditorProps {
  /** Partial host draft, or null for a blank form. */
  draft: unknown;
  /**
   * Existing canonical work to edit. The host prefills from it and keeps every
   * field the form does not represent; it wins over `draft` when both are set.
   */
  work?: unknown;
  /** Submit button text; the host default reads as citing. */
  submitLabel?: string;
  /** Receives a work the host has validated. */
  onSubmit: (work: unknown) => void;
  onCancel: () => void;
}

export interface CitationRepair {
  work: unknown;
  summary: CitationWorkSummary;
  uncertainFields: string[];
  /** Credits the settled repair deducted, when the host reports it. */
  creditsDeducted?: number | null;
}

export interface CitationLibraryAdapter {
  /** Stable query key prefix for this document's library scope. */
  queryKey: readonly unknown[];
  list(query: string): Promise<CitationResult<CitationLibraryItem[]>>;
  getMany(
    ids: string[]
  ): Promise<
    CitationResult<{ items: CitationLibraryItem[]; missingIds: string[] }>
  >;
  save(work: unknown): Promise<CitationResult<CitationLibraryItem>>;
  /**
   * Replaces a saved source's work at `item.version`; a newer server version
   * fails with a conflict instead of being overwritten.
   */
  update?(
    item: CitationLibraryItem,
    work: unknown
  ): Promise<CitationResult<CitationLibraryItem>>;
  /** Deletes the library item only; placed citations keep their snapshots. */
  remove?(item: CitationLibraryItem): Promise<CitationResult<void>>;
}

export interface CitationAdapter {
  formatDocument(
    style: CitationStyleId,
    citations: DocumentCitation[]
  ): FormattedDocumentCitations;
  inspectSnapshot(
    snapshot: CitationSnapshot,
    style: CitationStyleId
  ): CitationSnapshotInspection;
  /** Validates a work and wraps it in a versioned snapshot, or returns null. */
  createSnapshot(
    work: unknown,
    libraryVersion: number | null
  ): CitationSnapshot | null;
  library?: CitationLibraryAdapter;
  capture?: {
    /** Identifier capture: URL, DOI, ISBN, arXiv or PMID. */
    lookup(input: string): Promise<CitationResult<CitationCapture>>;
    /** Explicit title search; never triggered from document text. */
    searchTitle?(title: string): Promise<CitationResult<CitationCapture>>;
  };
  /** Host-rendered form for manual entry and completing incomplete captures. */
  renderManualEditor?: (props: CitationManualEditorProps) => ReactNode;
  /** True when the manual form can edit this work without downgrading it. */
  canEditWork?: (work: unknown) => boolean;
  /** AI repair of a stored snapshot; billed by the host, never priced here. */
  repair?: CitationRepairAdapter;
}

/**
 * AI repair. One operation id covers a snapshot's repair until a reviewed result
 * arrives: retries after a failure or lost response resend the same id and
 * input so billing stays idempotent.
 */
export interface CitationRepairAdapter {
  createOperationId(): string;
  run(
    snapshot: CitationSnapshot,
    operationId: string
  ): Promise<CitationResult<CitationRepair>>;
  /** Repairs one pasted reference before it is cited. */
  runRaw?(
    input: string,
    operationId: string
  ): Promise<CitationResult<CitationRepair>>;
}

/** Library/integrity state of one placed citation, in priority order. */
export type CitationRecovery =
  | { kind: 'invalid' }
  | { kind: 'unlinked' }
  | { kind: 'checking' }
  | { kind: 'linked' }
  | { kind: 'update-available'; item: CitationLibraryItem }
  | { kind: 'detached' }
  | { kind: 'library-unavailable' };
