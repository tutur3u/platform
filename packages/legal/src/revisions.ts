import { reviseLegalDocument } from './commercial-revisions';
import { getCommunityPolicy } from './community-policies';
import { getLegalDocument } from './documents';
import { mobileRevisionCopy } from './mobile-revision-copy';
import type { LegalDocument } from './types';

export const upcomingLegalRevision = {
  version: '2026-11-02',
  effectiveDate: '2026-12-02',
  publishedDate: '2026-11-02',
} as const;

export type ProposedLegalVersion =
  | '2026-09-13-draft'
  | typeof upcomingLegalRevision.version;

export function getLegalRevision(
  kind: LegalDocument['kind'],
  locale: string,
  version: ProposedLegalVersion = upcomingLegalRevision.version
): LegalDocument {
  const draft =
    kind === 'acceptable-use' || kind === 'community-guidelines'
      ? getCommunityPolicy(kind, locale)
      : reviseLegalDocument(getLegalDocument(kind, locale));
  if (version === '2026-09-13-draft') return draft;
  const copy = mobileRevisionCopy[draft.locale];
  const sections = [...draft.sections];
  if (kind === 'privacy') {
    sections.push({
      id: 'privacy-mobile',
      title: draft.locale === 'vi' ? 'Ứng dụng di động' : 'Mobile app',
      content: copy.paragraphs.join('\n\n'),
      icon: 'bell',
      tone: 'blue',
    });
  }
  if (kind === 'subprocessors') {
    sections.push(
      ...copy.processors.map((provider, index) => ({
        id: `subprocessors-mobile-${index + 1}`,
        title: provider.name,
        content: [
          provider.purpose,
          provider.dataCategories.join('; '),
          provider.regions.join('; '),
          `[Firebase](${provider.privacyUrl})`,
          upcomingLegalRevision.effectiveDate,
        ].join('\n\n'),
        icon: 'server' as const,
        tone: 'blue' as const,
      }))
    );
  }
  return { ...draft, ...upcomingLegalRevision, sections };
}
