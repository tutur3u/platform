import { getLegalRevision, type ProposedLegalVersion } from './revisions';
import type { LegalDocument } from './types';

export function getProposedLegalDocument(
  kind: LegalDocument['kind'],
  locale: string,
  version?: ProposedLegalVersion
): Omit<LegalDocument, 'effectiveDate'> {
  const document = getLegalRevision(kind, locale, version);
  const { effectiveDate: _effectiveDate, ...proposed } = document;
  return {
    ...proposed,
    badge: locale === 'vi' ? 'Dự kiến' : 'Proposed',
  };
}
