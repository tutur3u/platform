import {
  getLegalDocument,
  type getLegalNotice,
  getProposedLegalDocument,
  type LegalLocale,
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
  return (
    <div className="change-versions">
      {[
        {
          current: getLegalDocument('terms', locale),
          proposed: getProposedLegalDocument('terms', locale),
        },
      ].map(({ current, proposed }) => (
        <div className="version-pair" key="versions">
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
          <section>
            <strong>{notice ? copy.published : copy.to}</strong>
            <p>{proposed.version}</p>
            <dl>
              <div>
                <dt>{copy.effective}</dt>
                <dd>{notice?.noticeDate ?? copy.notice}</dd>
              </div>
              <div>
                <dt>{copy.published}</dt>
                <dd>{notice?.noticeDate ?? proposed.publishedDate}</dd>
              </div>
            </dl>
          </section>
        </div>
      ))}
    </div>
  );
}
