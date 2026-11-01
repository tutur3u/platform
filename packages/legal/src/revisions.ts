import { reviseLegalDocument } from './commercial-revisions';
import { getCommunityPolicy } from './community-policies';
import { getLegalDocument } from './documents';
import { mobileRevisionCopy } from './mobile-revision-copy';
import type { LegalDocument, LegalSection } from './types';

export const upcomingLegalRevision = {
  version: '2026-11-02',
  effectiveDate: '2026-12-02',
  publishedDate: '2026-11-02',
} as const;

export const upcomingMobilePrivacyRevision = {
  version: '2026-11-02-mobile',
  kind: 'privacy',
  published: false,
  effectiveDate: null,
  publishedDate: '2026-11-02',
} as const;

type CommercialProposedVersion =
  | '2026-09-13-draft'
  | typeof upcomingLegalRevision.version;
export type MobilePrivacyDocument = Omit<LegalDocument, 'effectiveDate'> & {
  effectiveDate: string | null;
  published: boolean;
};

export function requireMobilePrivacyReleaseDate(
  date: string | null | undefined
): string {
  if (
    !date ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new Error(
      'Mobile privacy publication requires a pinned release date'
    );
  return date;
}

function mobileSection(locale: LegalDocument['locale']): LegalSection {
  return {
    id: 'privacy-mobile',
    title: locale === 'vi' ? 'Ứng dụng di động' : 'Mobile app',
    content: mobileRevisionCopy[locale].paragraphs.join('\n\n'),
    icon: 'bell',
    tone: 'blue',
  };
}

export type ProposedLegalVersion =
  | CommercialProposedVersion
  | typeof upcomingMobilePrivacyRevision.version;

export function getLegalRevision(
  kind: LegalDocument['kind'],
  locale: string,
  version?: CommercialProposedVersion
): LegalDocument;
export function getLegalRevision(
  kind: 'privacy',
  locale: string,
  version: typeof upcomingMobilePrivacyRevision.version
): MobilePrivacyDocument;
export function getLegalRevision(
  kind: LegalDocument['kind'],
  locale: string,
  version?: ProposedLegalVersion
): LegalDocument | MobilePrivacyDocument;
export function getLegalRevision(
  kind: LegalDocument['kind'],
  locale: string,
  version: ProposedLegalVersion = upcomingLegalRevision.version
): LegalDocument | MobilePrivacyDocument {
  if (version === upcomingMobilePrivacyRevision.version) {
    if (kind !== 'privacy')
      throw new Error('Mobile revision supports privacy only');
    const current = getLegalDocument('privacy', locale);
    return {
      ...current,
      ...upcomingMobilePrivacyRevision,
      sections: [...current.sections, mobileSection(current.locale)],
    };
  }
  const draft =
    kind === 'acceptable-use' || kind === 'community-guidelines'
      ? getCommunityPolicy(kind, locale)
      : reviseLegalDocument(getLegalDocument(kind, locale));
  if (version === '2026-09-13-draft') return draft;
  const copy = mobileRevisionCopy[draft.locale];
  const sections = [...draft.sections];
  if (kind === 'privacy') {
    sections.push(mobileSection(draft.locale));
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
