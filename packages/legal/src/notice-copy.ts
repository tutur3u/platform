// Lex-owned wording: the change notice of the 2026-11-11 revision, extracted
// verbatim from the frozen FINAL (§2) into `revision-2026-11-11/`. Keep the
// approved notice fixture synchronized.
//
// Held rows (the `[HOLD …]` mini-tables of the FINAL) stay out of `rows` until
// their hold unit is released in `revision-2026-11-11/holds.ts`; the fallback
// row renders until then.
//
// Publish gate: `{ARCHIVE_LINKS}` in `links` is a placeholder for the archived
// previous versions. It is never rendered literally. `getLegalNotice`
// substitutes `LegalNoticeConfig.archiveLinks[locale]` and throws when it is
// unset. Lex approves the real archive URLs before publication.
import { renderRevisionNotice } from './revision-2026-11-11/render';

export const legalNoticeCopy = {
  en: renderRevisionNotice('en'),
  vi: renderRevisionNotice('vi'),
};
