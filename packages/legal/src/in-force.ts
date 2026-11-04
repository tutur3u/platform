import { LEGAL_DOCUMENTS } from './documents';
import { getEffectiveCommunityPolicy } from './effective-community';
import { type LegalNoticeConfig, legalNotice } from './notice';
import { renderPublishedRevision } from './revision-2026-11-11/published';
import type { LegalDocument, LegalDocumentKind } from './types';

/** The 2026-08-15 version, in force until the 2026-11-11 revision publishes. */
export const AUGUST_LEGAL_VERSION = '2026-08-15';

/**
 * A superseded or current version by its version id. `2026-08-15` returns the
 * exact objects the canonical pages served before the 2026-11-11 revision.
 */
export function getLegalDocumentVersion(
  version: string,
  kind: LegalDocumentKind,
  locale: string
): LegalDocument | null {
  if (version !== AUGUST_LEGAL_VERSION) return null;
  return LEGAL_DOCUMENTS[locale === 'vi' ? 'vi' : 'en'][kind];
}

/**
 * The document currently in force. The 2026-11-11 revision of Privacy, Terms,
 * DPA and Subprocessors replaces the 2026-08-15 text only when the release
 * owner publishes the notice (`legalNotice.published`), so the notice and the
 * in-force pages switch together. `LEGAL_DOCUMENTS` keeps the 2026-08-15 text,
 * which the archive serves unchanged.
 */
export function getLegalDocument(
  kind: LegalDocumentKind | 'acceptable-use' | 'community-guidelines',
  locale: string,
  notice: LegalNoticeConfig = legalNotice
): LegalDocument {
  if (kind === 'acceptable-use' || kind === 'community-guidelines')
    return getEffectiveCommunityPolicy(kind, locale);
  const resolved = locale === 'vi' ? 'vi' : 'en';
  if (notice.published && kind !== 'sla')
    return renderPublishedRevision(kind, resolved, notice);
  return LEGAL_DOCUMENTS[resolved][kind];
}
