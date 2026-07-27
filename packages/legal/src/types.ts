export type LegalLocale = 'en' | 'vi';

export type LegalDocumentKind =
  | 'privacy'
  | 'terms'
  | 'dpa'
  | 'sla'
  | 'subprocessors';

export type LegalSectionTone =
  | 'purple'
  | 'blue'
  | 'green'
  | 'orange'
  | 'cyan'
  | 'indigo'
  | 'emerald'
  | 'amber'
  | 'rose';

export interface LegalSummaryRow {
  summary: string;
  topic: string;
}

export interface LegalSection {
  content: string;
  icon:
    | 'shield'
    | 'file'
    | 'users'
    | 'lock'
    | 'clock'
    | 'globe'
    | 'database'
    | 'scale'
    | 'credit-card'
    | 'code'
    | 'server'
    | 'bell';
  title: string;
  tone: LegalSectionTone;
}

export interface LegalDocument {
  badge: string;
  effectiveDate: string;
  footer: string;
  highlightedWord: string;
  kind: LegalDocumentKind;
  locale: LegalLocale;
  publishedDate: string;
  reviewRequired: boolean;
  sections: LegalSection[];
  summaryDescription: string;
  summaryRows: LegalSummaryRow[];
  summaryTitle: string;
  title: string;
  version: string;
}

export interface ArchivedLegalVersion {
  effectiveDate: string;
  kind: LegalDocumentKind;
  locale: LegalLocale;
  version: string;
}

export interface Subprocessor {
  changedAt: string;
  dataCategories: readonly string[];
  name: string;
  privacyUrl: string;
  purpose: string;
  regions: readonly string[];
}
