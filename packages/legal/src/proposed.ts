import { reviseLegalDocument } from './commercial-revisions';
import { getCommunityPolicy } from './community-policies';
import { getLegalDocument } from './documents';
import type { LegalDocument } from './types';

export function getProposedLegalDocument(
  kind: LegalDocument['kind'],
  locale: string
): Omit<LegalDocument, 'effectiveDate'> {
  const document =
    kind === 'acceptable-use' || kind === 'community-guidelines'
      ? getCommunityPolicy(kind, locale)
      : reviseLegalDocument(getLegalDocument(kind, locale));
  const { effectiveDate: _effectiveDate, ...proposed } = document;
  return {
    ...proposed,
    badge: locale === 'vi' ? 'Dự kiến' : 'Proposed',
  };
}
