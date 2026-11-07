import { type LegalNoticeConfig, legalNotice } from './notice-config';
import { legalNoticeCopy } from './notice-copy';
import { requireMobilePrivacyReleaseDate } from './revisions';
import type { LegalLocale } from './types';

// The config lives in a dependency-free module so app shells can read it
// through `@tuturuuu/legal/notice-config` without loading the legal corpus.
export { type LegalNoticeConfig, legalNotice } from './notice-config';

export function getLegalNotice(
  locale: LegalLocale,
  config: LegalNoticeConfig = legalNotice
) {
  if (!config.published) return null;
  if (!config.noticeDate || !config.laterDate)
    throw new Error('Notice dates are required');
  const archiveLinks = config.archiveLinks?.[locale]?.trim();
  if (!archiveLinks)
    throw new Error('Archive links are required to publish the notice');
  const mobilePrivacyEffectiveDate = requireMobilePrivacyReleaseDate(
    config.mobilePrivacyEffectiveDate
  );
  const replace = (text: string) =>
    text
      .replaceAll('{N30}', config.laterDate)
      .replaceAll('{N}', config.noticeDate);
  const copy = legalNoticeCopy[locale];
  return {
    title: copy.title,
    summaryTitle: copy.summaryTitle,
    links: replace(copy.links.replace('{ARCHIVE_LINKS}', () => archiveLinks)),
    noticeDate: config.noticeDate,
    mobilePrivacyEffectiveDate,
    binding: replace(copy.binding),
    tableHead: copy.tableHead,
    rows: copy.rows.map((row) => row.map(replace)),
    nonbinding: copy.nonbinding,
  };
}
