import {
  AUGUST_LEGAL_VERSION,
  getLegalDocumentVersion,
  type getLegalNotice,
  type LegalLocale,
  REVISION_DATE,
} from '@tuturuuu/legal';
import { changeCopy } from './change-copy';

export function ChangeVersions({
  locale,
  notice,
}: {
  locale: LegalLocale;
  notice: ReturnType<typeof getLegalNotice>;
}) {
  const copy = changeCopy[locale];
  // The pair is built from the Terms only, so it is labelled as the Terms
  // rather than reading as the version of all seven documents.
  // The version that the 2026-11-11 revision replaces.
  const current = getLegalDocumentVersion(
    AUGUST_LEGAL_VERSION,
    'terms',
    locale
  )!;
  return (
    <div className="change-versions">
      <p className="version-document">
        {current.title} {current.highlightedWord}
      </p>
      <div className="version-pair">
        <section>
          <strong>{copy.from}</strong>
          <p>{current.version}</p>
          <dl>
            <div>
              <dt>{copy.effective}</dt>
              <dd>{current.effectiveDate}</dd>
            </div>
            <div>
              <dt>{copy.published}</dt>
              <dd>{current.publishedDate}</dd>
            </div>
          </dl>
        </section>
        {notice ? (
          <section>
            <strong>{copy.published}</strong>
            <p>{REVISION_DATE}</p>
            <dl>
              <div>
                <dt>{copy.effective}</dt>
                <dd>{notice.noticeDate}</dd>
              </div>
              <div>
                <dt>{copy.published}</dt>
                <dd>{notice.noticeDate}</dd>
              </div>
            </dl>
          </section>
        ) : (
          // Unpublished: no version id and no date. The id carries the draft
          // marker, and nothing here may imply an effective or published date.
          <section>
            <strong>{copy.to}</strong>
            <p className="version-pending">{copy.notice}</p>
          </section>
        )}
      </div>
    </div>
  );
}
