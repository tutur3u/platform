import type { LegalLocale, LegalSummaryRow } from '../types';

export type RevisionKind = 'privacy' | 'terms' | 'dpa' | 'subprocessors';

/**
 * A run of FINAL text. `holds` lists the hold units that must all be released
 * before the text renders. `fallbackFor` marks publishable fallback text that
 * stops rendering once that hold unit is released.
 */
export interface RevisionPart {
  fallbackFor?: string;
  holds?: string[];
  text: string;
}

export interface RevisionSectionSource {
  id: string;
  parts: RevisionPart[];
  title: string;
}

export interface RevisionDocumentSource {
  badge: string;
  footer: string;
  highlightedWord: string;
  sections: RevisionSectionSource[];
  summaryDescription: string;
  summaryRows: LegalSummaryRow[];
  summaryTitle: string;
  title: string;
}

export interface RevisionNoticeSource {
  binding: string;
  links: string;
  nonbinding: string;
  summaryTitle: string;
  table: RevisionPart[];
  tableHead: string[];
  title: string;
}

export interface RevisionSource {
  documents: Record<RevisionKind, Record<LegalLocale, RevisionDocumentSource>>;
  notice: Record<LegalLocale, RevisionNoticeSource>;
}
