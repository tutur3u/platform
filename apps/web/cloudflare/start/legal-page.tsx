import {
  getLegalDocument,
  type LegalLocale,
  legalChangesCopy,
} from '@tuturuuu/legal';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { LegalMarkdown } from '../../src/components/legal/legal-markdown';
import { type NativeLegalKind, nativeLegalPage } from '../native-legal';

export function legalDocument(kind: NativeLegalKind, locale: LegalLocale) {
  return getLegalDocument(kind, locale);
}

export function LegalPage({
  kind,
  locale,
}: {
  kind: NativeLegalKind;
  locale: LegalLocale;
}) {
  const document = legalDocument(kind, locale);
  const copy = locale === 'vi' ? vi.web_start_legal : en.web_start_legal;
  const prefix = locale === 'vi' ? '/vi' : '';
  const slug = nativeLegalPage(kind).slug;
  return (
    <main>
      <header>
        <nav aria-label={copy.navigation}>
          <a href={`${prefix}/privacy`}>{copy.privacy}</a>
          <a href={`${prefix}/terms`}>{copy.terms}</a>
          <a href={`${prefix}/community-guidelines`}>
            {copy.community_guidelines}
          </a>
          <a
            href={`/${locale === 'vi' ? 'en' : 'vi'}/${slug}`}
            lang={locale === 'vi' ? 'en' : 'vi'}
          >
            {copy.language}
          </a>
        </nav>
        <p>{document.badge}</p>
        <h1>
          {document.title} {document.highlightedWord}
        </h1>
        <p>
          {copy.effective_date}{' '}
          <time dateTime={document.effectiveDate}>
            {new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            }).format(new Date(`${document.effectiveDate}T00:00:00Z`))}
          </time>
        </p>
        <LegalMarkdown>
          {legalChangesCopy[locale].linkLine.replace(
            '](/legal/changes)',
            `](/${locale === 'vi' ? 'vi/' : ''}legal/changes)`
          )}
        </LegalMarkdown>
      </header>
      <section aria-labelledby="summary">
        <h2 id="summary">{document.summaryTitle}</h2>
        <p>{document.summaryDescription}</p>
        <dl>
          {document.summaryRows.map((row) => (
            <div key={row.topic}>
              <dt>{row.topic}</dt>
              <dd>{row.summary}</dd>
            </div>
          ))}
        </dl>
      </section>
      <nav aria-label={copy.contents}>
        <ol>
          {document.sections.map((section, index) => (
            <li key={section.title}>
              <a href={`#section-${index + 1}`}>{section.title}</a>
            </li>
          ))}
        </ol>
      </nav>
      {document.sections.map((section, index) => (
        <section key={section.title} aria-labelledby={`section-${index + 1}`}>
          <h2 id={`section-${index + 1}`}>{section.title}</h2>
          <LegalMarkdown>
            {locale === 'vi'
              ? section.content.replace(
                  /\]\((\/(?!\/|en\/|vi\/)[^)]+)\)/gu,
                  (_match: string, path: string) => `](/vi${path})`
                )
              : section.content}
          </LegalMarkdown>
        </section>
      ))}
      <footer>
        <p>{document.footer}</p>
        <a href="mailto:legal@tuturuuu.com">{copy.contact}</a>
      </footer>
    </main>
  );
}
