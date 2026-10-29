import {
  getLegalDocument,
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
export function ProposedLegalDocuments({ locale }: { locale: LegalLocale }) {
  const copy = legalChangesCopy[locale];
  return (
    <div className="proposed-documents">
      {kinds.map((kind) => {
        const document = getProposedLegalDocument(kind, locale);
        const inheritedFooter = getLegalDocument(kind, locale).footer;
        // Internal review annotations are excluded from proposal presentation only.
        const footer =
          /legal review|counsel-review|rà soát pháp lý|chờ rà soát/iu.test(
            inheritedFooter
          ) && document.footer.endsWith(inheritedFooter)
            ? document.footer.slice(0, -inheritedFooter.length).trimEnd()
            : document.footer;
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
