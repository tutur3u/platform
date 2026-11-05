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
 * date must equal the revision date. The mobile release date D may be unset:
 * the mobile items then stay held and no date is shown. When D is set it is
 * validated, fills `{D}` and releases the mobile items when D <= N.
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
  const mobileDate =
    notice.mobilePrivacyEffectiveDate == null
      ? null
      : requireMobilePrivacyReleaseDate(notice.mobilePrivacyEffectiveDate);
  return renderRevisionDocument(kind, locale, {
    mobileDate,
    mobileReleased: mobileDate !== null && mobileDate <= notice.noticeDate,
  });
}
