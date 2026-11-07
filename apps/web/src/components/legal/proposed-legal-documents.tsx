import {
  getLegalDocument,
  getProposedLegalDocument,
  type LegalLocale,
  type LegalNoticeConfig,
  legalChangesCopy,
  REVISION_KINDS,
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
const revisionKinds: readonly string[] = REVISION_KINDS;

export function ProposedLegalDocuments({
  locale,
  notice,
}: {
  locale: LegalLocale;
  /** A published notice: the revised documents are in force, not proposed. */
  notice?: Extract<LegalNoticeConfig, { published: true }>;
}) {
  const copy = legalChangesCopy[locale];
  return (
    <div className="proposed-documents">
      {kinds.map((kind) => {
        const inForce = Boolean(notice) && revisionKinds.includes(kind);
        const document =
          inForce && notice
            ? getLegalDocument(kind, locale, notice)
            : getProposedLegalDocument(kind, locale);
        // Internal review annotations are excluded from proposal presentation only.
        // Open decision (user): in-force footers "remove|keep". On publication
        // day the proposed footers must match whichever is chosen for the
        // in-force pages; Lex confirms then. Do not change this by itself.
        const footer = inForce
          ? document.footer
          : stripInternalReviewSentences(document.footer);
        return (
          <article id={kind} key={kind}>
            {!inForce && <p>{copy.proposed}</p>}
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
