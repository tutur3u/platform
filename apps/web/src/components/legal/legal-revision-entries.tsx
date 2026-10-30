import {
  type getLegalNotice,
  getLegalRevision,
  type LegalLocale,
  legalChangesCopy,
  legalRevisionChangesCopy,
  upcomingLegalRevision,
  upcomingMobilePrivacyRevision,
} from '@tuturuuu/legal';
import { LegalMarkdown } from './legal-markdown';
import { stripInternalReviewSentences } from './proposal-footer';

export function LegalRevisionEntries({
  locale,
  notice,
  full,
}: {
  locale: LegalLocale;
  notice: ReturnType<typeof getLegalNotice>;
  full: boolean;
}) {
  const copy = legalRevisionChangesCopy[locale];
  const mobile = getLegalRevision(
    'privacy',
    locale,
    upcomingMobilePrivacyRevision.version
  );
  const releaseDate =
    notice?.mobilePrivacyEffectiveDate ??
    upcomingMobilePrivacyRevision.effectiveDate;
  return (
    <div className="legal-revision-entries">
      <section data-legal-revision={upcomingMobilePrivacyRevision.version}>
        <h2>{upcomingMobilePrivacyRevision.version}</h2>
        {releaseDate ? (
          <time dateTime={releaseDate}>{releaseDate}</time>
        ) : (
          <p>{copy.pendingDate}</p>
        )}
        <ul>
          <li>
            <LegalMarkdown>{copy.mobile}</LegalMarkdown>
          </li>
        </ul>
        {full && (
          <article id="mobile-privacy">
            <h3>
              {mobile.title} {mobile.highlightedWord}
            </h3>
            {mobile.sections.map((section) => (
              <section key={section.id}>
                <h4>{section.title}</h4>
                <LegalMarkdown>{section.content}</LegalMarkdown>
              </section>
            ))}
            <footer>
              <p>{stripInternalReviewSentences(mobile.footer)}</p>
              <a href={locale === 'vi' ? '/vi/privacy' : '/privacy'}>
                {legalChangesCopy[locale].currentVersion}
              </a>
            </footer>
          </article>
        )}
      </section>
      <section data-legal-revision={upcomingLegalRevision.version}>
        <h2>{upcomingLegalRevision.version}</h2>
        <time dateTime={upcomingLegalRevision.effectiveDate}>
          {upcomingLegalRevision.effectiveDate}
        </time>
        <ul>
          <li>
            <LegalMarkdown>{copy.processors}</LegalMarkdown>
          </li>
        </ul>
      </section>
    </div>
  );
}
