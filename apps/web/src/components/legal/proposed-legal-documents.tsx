import {
  getProposedLegalDocument,
  type LegalLocale,
  legalChangesCopy,
} from '@tuturuuu/legal';
import { LegalMarkdown } from './legal-markdown';
import { stripInternalReviewSentences } from './proposal-footer';

const kinds = [
  'privacy',
  'terms',
  'dpa',
  'sla',
  'subprocessors',
  'acceptable-use',
  'community-guidelines',
] as const;
export function ProposedLegalDocuments({ locale }: { locale: LegalLocale }) {
  const copy = legalChangesCopy[locale];
  return (
    <div className="proposed-documents">
      {kinds.map((kind) => {
        const document = getProposedLegalDocument(kind, locale);
        // Internal review annotations are excluded from proposal presentation only.
        // Open decision (user): in-force footers "remove|keep". On publication
        // day the proposed footers must match whichever is chosen for the
        // in-force pages; Lex confirms then. Do not change this by itself.
        const footer = stripInternalReviewSentences(document.footer);
        return (
          <article id={kind} key={kind}>
            <p>{copy.proposed}</p>
            <h2>
              {document.title} {document.highlightedWord}
            </h2>
            {document.sections.map((section) => (
              <section key={section.id}>
                <h3>{section.title}</h3>
                <LegalMarkdown>{section.content}</LegalMarkdown>
              </section>
            ))}
            <footer>
              <p>{footer}</p>
              <a
                href={`${locale === 'vi' ? '/vi' : ''}/${['dpa', 'sla', 'subprocessors'].includes(kind) ? 'legal/' : ''}${kind}`}
              >
                {copy.currentVersion}
              </a>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
