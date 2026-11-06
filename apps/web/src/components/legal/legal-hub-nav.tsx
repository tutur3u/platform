import { getLegalDocument, type LegalLocale } from '@tuturuuu/legal';
import { changeCopy } from './change-copy';
export function LegalHubNav({
  locale,
  proposed = false,
}: {
  locale: LegalLocale;
  proposed?: boolean;
}) {
  const prefix = locale === 'vi' ? '/vi' : '';
  return (
    <nav className="legal-hub-nav" aria-label={changeCopy[locale].navigation}>
      {(
        [
          'privacy',
          'terms',
          'acceptable-use',
          'community-guidelines',
          'dpa',
          'sla',
          'subprocessors',
        ] as const
      ).map((kind) => {
        const document = getLegalDocument(kind, locale);
        return (
          <a
            key={kind}
            href={`${prefix}/${['dpa', 'sla', 'subprocessors'].includes(kind) ? 'legal/' : ''}${kind}`}
          >
            {document.title} {document.highlightedWord}
          </a>
        );
      })}
      <a href={`${prefix}/legal/changes`} aria-current="page">
        {changeCopy[locale].changes}
        {proposed && <span className="proposed-dot" aria-hidden="true" />}
      </a>
    </nav>
  );
}
