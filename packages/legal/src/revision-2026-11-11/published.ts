import type { LegalNoticeConfig } from '../notice';
import { requireMobilePrivacyReleaseDate } from '../revisions';
import type { LegalDocument, LegalLocale } from '../types';
import {
  REVISION_DATE,
  type RevisionKind,
  renderRevisionDocument,
} from './render';

/**
 * Renders the in-force 2026-11-11 text for a published notice. The notice
 * date must equal the revision date, and the mobile release date D must be
 * pinned (it fills `{D}` and releases the mobile items when D <= N).
 */
export function renderPublishedRevision(
  kind: RevisionKind,
  locale: LegalLocale,
  notice: Extract<LegalNoticeConfig, { published: true }>
): LegalDocument {
  if (notice.noticeDate !== REVISION_DATE)
    throw new Error(
      `The published notice date must be the revision date ${REVISION_DATE}`
    );
  const mobileDate = requireMobilePrivacyReleaseDate(
    notice.mobilePrivacyEffectiveDate
  );
  return renderRevisionDocument(kind, locale, {
    mobileDate,
    mobileReleased: mobileDate <= notice.noticeDate,
  });
}
