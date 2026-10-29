import {
  getProposedLegalDocument,
  type LegalLocale,
  legalChangesCopy,
} from '@tuturuuu/legal';
import { LegalMarkdown } from './legal-markdown';

const kinds = [
  'privacy',
  'terms',
  'dpa',
  'sla',
  'subprocessors',
  'acceptable-use',
  'community-guidelines',
] as const;
export function LegalChanges({
  locale,
  full = false,
}: {
  locale: LegalLocale;
  full?: boolean;
}) {
  const copy = legalChangesCopy[locale];
  const localize = (text: string) =>
    locale === 'vi'
      ? text.replace(/\]\((\/legal\/changes[^)]*)\)/gu, '](/vi$1)')
      : text;
  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-16">
      {full
        ? kinds.map((kind) => {
            const document = getProposedLegalDocument(kind, locale);
            return (
              <article key={kind} id={kind} className="space-y-4">
                <p>{copy.proposed}</p>
                <h1>
                  {document.title} {document.highlightedWord}
                </h1>
                <h2>{document.summaryTitle}</h2>
                <p>{document.summaryDescription}</p>
                <dl>
                  {document.summaryRows.map((row) => (
                    <div key={row.topic}>
                      <dt>{row.topic}</dt>
                      <dd>{row.summary}</dd>
                    </div>
                  ))}
                </dl>
                {document.sections.map((section) => (
                  <section key={section.title}>
                    <h2>{section.title}</h2>
                    <LegalMarkdown>{section.content}</LegalMarkdown>
                  </section>
                ))}
              </article>
            );
          })
        : localize(copy.summary)
            .replace(/\n {2}/gu, ' ')
            .replace(/^- /gmu, '* ')
            .split(/\n(?=##? )/u)
            .map((block) => {
              const [heading, ...body] = block.split('\n');
              const title = heading?.replace(/^##? /u, '');
              return (
                <section key={heading}>
                  {heading?.startsWith('## ') ? (
                    <h2>{title}</h2>
                  ) : (
                    <h1>{title}</h1>
                  )}
                  <LegalMarkdown>{body.join('\n')}</LegalMarkdown>
                </section>
              );
            })}
    </main>
  );
}
