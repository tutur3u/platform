import { legalNoticeCopy } from './notice-copy';
import type { LegalLocale } from './types';

export type LegalNoticeConfig =
  | {
      published: false;
      noticeDate: null;
      laterDate: null;
      archiveLinks?: null;
    }
  | {
      published: true;
      noticeDate: string;
      laterDate: string;
      // Markdown for the "Previous text" link line, per locale. Publish gate:
      // Lex approves the real archive URLs before publication; do not invent
      // them. Publishing without the rendered locale's entry throws.
      archiveLinks: Partial<Record<LegalLocale, string>>;
    };

// Only the release owner may enable this after the user's explicit notice go.
export const legalNotice: LegalNoticeConfig = {
  published: false,
  noticeDate: null,
  laterDate: null,
  archiveLinks: null,
};

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
    binding: replace(copy.binding),
    tableHead: copy.tableHead,
    rows: copy.rows.map((row) => row.map(replace)),
    nonbinding: copy.nonbinding,
  };
}
