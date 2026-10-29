import { acceptableUseSections } from './effective-acceptable-use-sections';
import { acceptableUseSummaryRows } from './effective-acceptable-use-summary';
import type { CommunityPolicyKind, LegalDocument } from './types';

const acceptableUse: Omit<LegalDocument, 'locale'> = {
  badge: 'Legal Documentation',
  title: 'Acceptable Use',
  highlightedWord: 'Policy',
  kind: 'acceptable-use',
  publishedDate: '2026-02-06',
  version: '2026-02-06',
  reviewRequired: false,
  effectiveDate: '2026-02-06',
  summaryTitle: 'Key Policy Points',
  summaryDescription:
    'This summary provides a quick overview but does not replace the full Acceptable Use Policy below.',
  summaryRows: acceptableUseSummaryRows,
  sections: acceptableUseSections,
  footer:
    'This Acceptable Use Policy ensures a safe and fair platform for all users. For questions, contact our legal department at legal@tuturuuu.com.',
};

import { communityGuidelinesSections } from './effective-community-guidelines-sections';
import { communityGuidelinesSummaryRows } from './effective-community-guidelines-summary';

const communityGuidelines: Omit<LegalDocument, 'locale'> = {
  badge: 'Community',
  title: 'Community',
  highlightedWord: 'Guidelines',
  kind: 'community-guidelines',
  publishedDate: '2026-02-06',
  version: '2026-02-06',
  reviewRequired: false,
  effectiveDate: '2026-02-06',
  summaryTitle: 'Guidelines at a Glance',
  summaryDescription:
    'This summary highlights the key principles but does not replace the full Community Guidelines below.',
  summaryRows: communityGuidelinesSummaryRows,
  sections: communityGuidelinesSections,
  footer:
    'These Community Guidelines help ensure a positive experience for everyone on Tuturuuu. If you have questions, please contact our community team at community@tuturuuu.com.',
};

export function getEffectiveCommunityPolicy(
  kind: CommunityPolicyKind,
  locale: string
): LegalDocument {
  return {
    ...(kind === 'acceptable-use' ? acceptableUse : communityGuidelines),
    locale: locale === 'vi' ? 'vi' : 'en',
  };
}
