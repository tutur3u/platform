import { getLegalDocumentVersion } from '@tuturuuu/legal';
import { getTranslations } from 'next-intl/server';
import {
  ARCHIVE_VERSION,
  ARCHIVED_KINDS,
  archivePath,
} from '@/components/legal/archive-legal-config';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.legal_archive',
  pathname: `/legal/archive/${ARCHIVE_VERSION}`,
  indexable: false,
});

export default async function LegalArchivePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: requested } = await params;
  const locale = requested === 'vi' ? 'vi' : 'en';
  const t = await getTranslations({
    locale,
    namespace: 'marketingSeo.legal_archive',
  });
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-24">
      <h1 className="font-semibold text-3xl">{t('title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('description')}</p>
      <ul className="mt-8 space-y-3">
        {ARCHIVED_KINDS.map((kind) => {
          const document = getLegalDocumentVersion(
            ARCHIVE_VERSION,
            kind,
            locale
          )!;
          return (
            <li key={kind}>
              <a
                className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                href={archivePath(locale, kind)}
              >
                {document.title} {document.highlightedWord}
              </a>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
